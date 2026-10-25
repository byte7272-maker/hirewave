"""§5.1 Authentication."""

from __future__ import annotations

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.firebase_auth import FirebaseAuthError
from jobsearch.engines.integration.engine import IntegrationError
from jobsearch.api.schemas import (
    DeleteAccountRequest,
    FirebaseAuthRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from jobsearch.api.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from jobsearch.models import Provider, User, UserProfile

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _tokens(user_id: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


def _require_signup_allowed(state: StateDep, code: str, email: str = "") -> None:
    """Gate account creation per ``signup_mode``. Open = anyone; closed = nobody;
    invite = a valid shared code (JOBSEARCH_SIGNUP_CODE) or a minted invite. Raises
    403 when not allowed. A managed invite is consumed only on a successful check."""
    mode = state.settings.signup_mode
    if mode == "open":
        return
    if mode == "closed":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "signups are currently closed")
    # invite mode
    code = (code or "").strip()
    shared = state.settings.signup_access_code
    if shared and code and secrets.compare_digest(code, shared):
        return
    if state.signup.redeem(code, email=email):
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "a valid invite code is required to sign up")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, state: StateDep) -> UserOut:
    if state.user_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    _require_signup_allowed(state, body.invite_code, email=body.email.lower())
    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        location=body.location,
    )
    state.users.add(user)
    state.profiles.add(UserProfile(user_id=user.id))
    # Seed clearly-labelled sample data so a new account isn't empty; it's replaced
    # the moment the user adds a real résumé / cover letter / ingests real jobs.
    try:
        from jobsearch.engines.demo_seed import seed_demo_data

        seed_demo_data(state, user.id)
    except Exception:  # noqa: BLE001 - seeding is best-effort; never block signup
        pass
    return UserOut(id=user.id, email=user.email, full_name=user.full_name, location=user.location)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, state: StateDep) -> TokenResponse:
    user = state.user_by_email(body.email)
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    return _tokens(user.id)


@router.post("/firebase", response_model=TokenResponse)
def firebase_login(body: FirebaseAuthRequest, state: StateDep) -> TokenResponse:
    """Exchange a verified Firebase ID token for this app's session tokens.

    The user authenticated directly with Firebase (Google / email / …) — this app
    never sees a password. First sign-in creates the account; later sign-ins reuse
    it (matched by email)."""
    try:
        claims = state.firebase_verifier.verify(body.id_token)
    except FirebaseAuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid Firebase token: {exc}") from exc
    email = (claims.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Firebase token has no email")

    user = state.user_by_email(email)
    if user is None:
        # First sign-in creates the account -> apply the signup gate. Existing users
        # signing in again are unaffected.
        _require_signup_allowed(state, body.invite_code, email=email)
        user = User(email=email, full_name=claims.get("name", ""), firebase_uid=claims.get("uid", ""))
        state.users.add(user)
        state.profiles.add(UserProfile(user_id=user.id))
    elif not user.firebase_uid and claims.get("uid"):
        user.firebase_uid = claims["uid"]  # link an existing (password) account
        state.users.add(user)
    return _tokens(user.id)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, state: StateDep) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid refresh token: {exc}") from exc
    if payload.get("jti") in state.revoked_jti:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh token has been revoked")
    if state.users.get(payload["sub"]) is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")
    return _tokens(payload["sub"])


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, state: StateDep) -> None:
    """Invalidate a refresh token (add its jti to the revocation set)."""
    try:
        payload = decode_token(body.refresh_token)
        state.revoked_jti.add(payload["jti"])
    except TokenError:
        pass  # already invalid — nothing to revoke


# Per-user repositories to wipe on account deletion (best-effort per repo).
_USER_SCOPED_REPOS = (
    "profiles", "resumes", "cover_letters", "applications", "notifications",
    "mock_interviews", "saved_answers", "monitored_identifiers", "exposure_findings",
    "experience_highlights", "persona_voices", "custom_voices", "onboarding",
    "saved_searches_repo", "saved_jobs", "auto_apply_grants", "screener_answers",
)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: DeleteAccountRequest, user: CurrentUser, state: StateDep) -> None:
    """Permanently delete the signed-in account and its data. Password accounts must
    confirm with their password. This is irreversible."""
    full = state.users.get(user.id)
    if full is not None and full.hashed_password and not verify_password(body.password, full.hashed_password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "password confirmation required")
    uid = user.id
    for repo_name in _USER_SCOPED_REPOS:
        repo = getattr(state, repo_name, None)
        if repo is None:
            continue
        try:
            for rec in list(repo.find(user_id=uid)):
                repo.delete(rec.id)
        except Exception:  # noqa: BLE001 - never let one repo block the wipe
            pass
    # The user's own sample/seeded postings (owner-scoped).
    try:
        for j in list(state.jobs.all()):
            if getattr(j, "owner_id", "") == uid:
                state.jobs.delete(j.id)
    except Exception:  # noqa: BLE001
        pass
    # Connected provider tokens + browser sessions.
    for prov in Provider:
        try:
            state.integration.revoke(uid, prov)
        except Exception:  # noqa: BLE001
            pass
    state.users.delete(uid)


# --- Sign in with Google (OIDC login) --------------------------------------
# A real server-side Google OAuth LOGIN (distinct from connecting Gmail): the
# backend holds state + PKCE, exchanges the code, reads the email from the OIDC
# id_token, finds/creates the user, and issues this app's session tokens. Reuses
# the existing Google (Gmail) OAuth client with login-only scopes.
_GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"]
_LOGIN_MARKER = "__google_login__"


def _google_login_redirect_uri(state: StateDep) -> str:
    """The backend callback Google redirects to — must be registered as an
    Authorized redirect URI on the Google client. Derived from the configured
    OAuth redirect base's origin so it tracks the deployment automatically."""
    origin = state.settings.oauth_redirect_base.split("/api/v1")[0].rstrip("/")
    return f"{origin}/api/v1/auth/google/callback"


@router.get("/google/login")
def google_login(state: StateDep):
    """Begin 'Sign in with Google'. Redirects the browser to Google's consent."""
    try:
        req = state.integration.build_authorization_request(
            Provider.GMAIL,
            scopes=_GOOGLE_LOGIN_SCOPES,
            redirect_uri=_google_login_redirect_uri(state),
        )
    except IntegrationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    state.pending_auth.put(
        req.state, user_id="", provider=_LOGIN_MARKER, code_verifier=req.code_verifier
    )
    return RedirectResponse(req.authorize_url, status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
def google_callback(
    state: StateDep,
    code: str = Query(default=""),
    oauth_state: str = Query(default="", alias="state"),
    error: str = Query(default=""),
):
    """Google redirect target for login: exchange the code, resolve the user by
    email, and issue session tokens. With ``login_success_redirect`` set, the
    browser is redirected there with the tokens in the URL fragment; otherwise the
    tokens are returned as JSON (handy for API testing)."""
    dest = state.settings.login_success_redirect

    def _fail(reason: str):
        if dest:
            return RedirectResponse(f"{dest}#error={reason}", status_code=status.HTTP_302_FOUND)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"google login failed: {reason}")

    if error or not code:
        return _fail(error or "missing_code")
    pending = state.pending_auth.pop(oauth_state)
    if pending is None or pending.get("provider") != _LOGIN_MARKER:
        return _fail("invalid_state")
    try:
        claims = state.integration.exchange_identity(
            Provider.GMAIL, code=code, code_verifier=pending.get("code_verifier", ""),
            redirect_uri=_google_login_redirect_uri(state),
        )
    except IntegrationError:
        return _fail("exchange_failed")

    email = (claims.get("email") or "").lower()
    if not email:
        return _fail("no_email")

    user = state.user_by_email(email)
    if user is None:
        # First Google sign-in creates the account — apply the signup gate (an
        # existing user signing in again is unaffected).
        try:
            _require_signup_allowed(state, "", email=email)
        except HTTPException:
            return _fail("signups_closed")
        user = User(email=email, full_name=claims.get("name", ""))
        state.users.add(user)
        state.profiles.add(UserProfile(user_id=user.id))

    tok = _tokens(user.id)
    if dest:
        frag = urlencode({
            "access_token": tok.access_token,
            "refresh_token": tok.refresh_token,
            "token_type": "bearer",
        })
        return RedirectResponse(f"{dest}#{frag}", status_code=status.HTTP_302_FOUND)
    return tok
