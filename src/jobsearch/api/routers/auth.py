"""§5.1 Authentication."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import StateDep
from jobsearch.api.firebase_auth import FirebaseAuthError
from jobsearch.api.schemas import (
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
from jobsearch.models import User, UserProfile

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _tokens(user_id: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, state: StateDep) -> UserOut:
    if state.user_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        location=body.location,
    )
    state.users.add(user)
    state.profiles.add(UserProfile(user_id=user.id))
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
