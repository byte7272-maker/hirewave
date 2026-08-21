"""§5.2 OAuth integrations."""

from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    ConnectResponse,
    LinkedInImportRequest,
    LinkedInImportResponse,
    ProfileUpdate,
)
from jobsearch.engines.integration import map_claims_to_profile, parse_export_text
from jobsearch.engines.integration.engine import IntegrationError
from jobsearch.models import Provider, UserProfile
from jobsearch.textextract import extract_text

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


def _provider(raw: str) -> Provider:
    try:
        return Provider(raw)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown provider '{raw}'") from exc


@router.post("/connect/{provider}", response_model=ConnectResponse)
def connect(provider: str, user: CurrentUser, state: StateDep) -> ConnectResponse:
    prov = _provider(provider)
    try:
        req = state.integration.build_authorization_request(prov)
    except IntegrationError as exc:  # e.g. live mode with no client credentials
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    state.pending_auth.put(
        req.state, user_id=user.id, provider=prov.value, code_verifier=req.code_verifier
    )
    return ConnectResponse(authorization_url=req.authorize_url, state=req.state)


def _redirect(state: StateDep, params: dict) -> RedirectResponse:
    base = state.settings.oauth_success_redirect
    return RedirectResponse(f"{base}?{urlencode(params)}", status_code=status.HTTP_302_FOUND)


@router.get("/callback/{provider}")
def callback(
    provider: str,
    state: StateDep,
    code: str = Query(default=""),
    oauth_state: str = Query(default="", alias="state"),
    error: str = Query(default=""),
):
    """OAuth redirect target — exchanges the code for encrypted tokens.

    If ``oauth_success_redirect`` is configured, the browser is redirected back
    to the frontend with ``?connected=`` / ``?error=``; otherwise a JSON body is
    returned (convenient for API testing).
    """
    prov = _provider(provider)
    redirecting = bool(state.settings.oauth_success_redirect)

    # The provider can send back an error instead of a code (user denied, etc.).
    if error or not code:
        detail = error or "missing authorization code"
        if redirecting:
            return _redirect(state, {"error": detail, "provider": prov.value})
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"authorization failed: {detail}")

    pending = state.pending_auth.pop(oauth_state)
    if pending is None or pending["provider"] != prov.value:
        if redirecting:
            return _redirect(state, {"error": "invalid_state", "provider": prov.value})
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid or expired oauth state")

    try:
        state.integration.complete_authorization(
            pending["user_id"], prov, code=code, code_verifier=pending["code_verifier"]
        )
    except IntegrationError as exc:
        if redirecting:
            return _redirect(state, {"error": "exchange_failed", "provider": prov.value})
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"token exchange failed: {exc}") from exc

    if redirecting:
        return _redirect(state, {"connected": prov.value})
    return {"connected": prov.value}


@router.get("")
def list_integrations(user: CurrentUser, state: StateDep) -> list[dict]:
    return state.integration.list_connections(user.id)


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def revoke(provider: str, user: CurrentUser, state: StateDep) -> None:
    prov = _provider(provider)
    if not state.integration.revoke(user.id, prov):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not connected")


# --- LinkedIn profile import ------------------------------------------------
def _merge_into_profile(state: StateDep, user_id: str, draft: UserProfile) -> UserProfile:
    """Non-destructively merge an imported draft into the stored profile —
    imported fields overwrite, but existing job preferences are preserved."""
    existing = state.profiles.get(user_id) or UserProfile(user_id=user_id)
    if draft.headline:
        existing.headline = draft.headline
    if draft.summary:
        existing.summary = draft.summary
    if draft.skills:
        existing.skills = draft.skills
    if draft.work_experience:
        existing.work_experience = draft.work_experience
    if draft.education:
        existing.education = draft.education
    return state.profiles.add(existing)


@router.post("/linkedin/import", response_model=LinkedInImportResponse)
def import_linkedin(
    body: LinkedInImportRequest, user: CurrentUser, state: StateDep
) -> LinkedInImportResponse:
    """Gather profile data from the user's connected LinkedIn account.

    Returns a *draft* to review by default; ``apply: true`` merges it into the
    stored profile (preserving existing job preferences). With the offline
    ``mock`` provider no connection is needed; the ``http`` provider uses the
    encrypted OAuth token stored when the user connected LinkedIn.
    """
    provider = state.linkedin_provider
    token = ""
    if provider.source != "mock":
        try:
            token = state.integration.get_access_token(user.id, Provider.LINKEDIN)
        except IntegrationError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    try:
        claims = provider.fetch(token)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    draft = map_claims_to_profile(user.id, claims)
    if body.apply:
        draft = _merge_into_profile(state, user.id, draft)
    return LinkedInImportResponse(source=provider.source, applied=body.apply, profile=draft)


@router.post("/linkedin/import-file", response_model=LinkedInImportResponse)
async def import_linkedin_file(
    user: CurrentUser,
    state: StateDep,
    file: UploadFile = File(...),
    apply: bool = Form(default=False),
) -> LinkedInImportResponse:
    """Import from a LinkedIn *data export* (or exported résumé PDF/DOCX/TXT).

    LinkedIn only returns rich profile data (positions, skills, education) to
    partner apps — but it lets *you* export your own complete data. This parses
    that export into a draft profile with no partner approval required.
    """
    data = await file.read()
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    text = extract_text(data, filename=file.filename or "", content_type=file.content_type or "")
    if not text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "could not read any text from the file")
    draft = parse_export_text(user.id, text)
    if apply:
        draft = _merge_into_profile(state, user.id, draft)
    return LinkedInImportResponse(source="export", applied=apply, profile=draft)


@router.post("/linkedin/apply", response_model=LinkedInImportResponse)
def apply_linkedin(
    body: ProfileUpdate, user: CurrentUser, state: StateDep
) -> LinkedInImportResponse:
    """Apply a *reviewed* import draft — only the fields the user kept.

    The client sends back exactly the parts of the draft it wants (after
    ticking/unticking individual skills, roles and schools), so what you see is
    what's saved. The merge is still non-destructive: an omitted/empty field
    leaves the stored value untouched, and job preferences are always preserved.
    """
    draft = UserProfile(
        user_id=user.id,
        headline=body.headline or "",
        summary=body.summary or "",
        skills=body.skills or [],
        work_experience=body.work_experience or [],
        education=body.education or [],
    )
    merged = _merge_into_profile(state, user.id, draft)
    return LinkedInImportResponse(source="review", applied=True, profile=merged)
