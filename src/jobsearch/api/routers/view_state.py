"""View state -- remember where the user was on a page so they don't start over.

A page (Resumes, Job matches, ...) saves a small blob of its UI state -- the
selected item, active tab, filters, a scroll anchor -- keyed by a short view
name. On return it reads that blob back and restores. Persisted per user on the
profile, so it survives a hard reload and follows the user across devices
(browser sessionStorage handles the instant, within-session case; this is the
durable layer).

The stored value is an arbitrary small JSON object owned by the client; the
server only bounds its size and never interprets it (and never feeds it to the
LLM).
"""

from __future__ import annotations

import json
import re

from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Query, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models import RecentView, UserProfile
from jobsearch.api.schemas import RecordViewRequest

router = APIRouter(prefix="/api/v1/view-state", tags=["view-state"])

_VIEW_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")  # short, url-safe view names
_MAX_VIEWS = 40  # per user -- plenty of distinct pages, bounded against abuse
_MAX_BYTES = 8 * 1024  # per view blob -- UI state is tiny; this is a generous cap


def _profile(state: StateDep, user_id: str) -> UserProfile:
    prof = state.profiles.get(user_id)
    if prof is None:
        prof = state.profiles.add(UserProfile(user_id=user_id))
    return prof


def _valid_view(view: str) -> str:
    if not _VIEW_RE.match(view or ""):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "invalid view name (use lowercase letters, digits, - and _; max 40 chars)",
        )
    return view


@router.get("")
def get_all_view_state(user: CurrentUser, state: StateDep) -> dict:
    """Every saved view blob for the user (empty map when none)."""
    return {"states": _profile(state, user.id).view_state}


@router.get("/{view}")
def get_view_state(view: str, user: CurrentUser, state: StateDep) -> dict:
    """The saved UI state for one view (``{}`` when nothing saved yet)."""
    _valid_view(view)
    return _profile(state, user.id).view_state.get(view, {})


@router.put("/{view}")
def set_view_state(
    view: str, user: CurrentUser, state: StateDep, body: dict = Body(...)
) -> dict:
    """Save the page's UI state (selected item, tab, filters, scroll anchor).

    The body is an arbitrary small JSON object; the server stores it verbatim.
    Rejects a non-object body, an oversized blob, or exceeding the per-user cap."""
    _valid_view(view)
    if not isinstance(body, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "body must be a JSON object")
    if len(json.dumps(body, separators=(",", ":")).encode("utf-8")) > _MAX_BYTES:
        raise HTTPException(
            413,  # content too large (constant name varies across Starlette versions)
            f"view state too large (max {_MAX_BYTES} bytes)",
        )
    prof = _profile(state, user.id)
    vs = dict(prof.view_state)
    if view not in vs and len(vs) >= _MAX_VIEWS:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"too many saved views (max {_MAX_VIEWS}); clear some first",
        )
    vs[view] = body
    prof.view_state = vs
    state.profiles.add(prof)  # persist the mutation
    return body


@router.delete("/{view}", status_code=status.HTTP_204_NO_CONTENT)
def clear_view_state(view: str, user: CurrentUser, state: StateDep) -> None:
    """Forget the saved state for one view (e.g. a 'reset this page' action)."""
    _valid_view(view)
    prof = _profile(state, user.id)
    if view in prof.view_state:
        vs = dict(prof.view_state)
        vs.pop(view, None)
        prof.view_state = vs
        state.profiles.add(prof)


# --- recently viewed ("jump back in" rail) ----------------------------------
recent_router = APIRouter(prefix="/api/v1/recently-viewed", tags=["recently-viewed"])


@recent_router.get("", response_model=list[RecentView])
def list_recently_viewed(
    user: CurrentUser, state: StateDep,
    kind: Optional[str] = Query(None, description="filter to one kind, e.g. 'resume'"),
    limit: int = Query(12, ge=1, le=50),
) -> list[RecentView]:
    """The user's recently opened items across pages (most-recent first) for the
    dashboard 'jump back in' rail."""
    items = _profile(state, user.id).recently_viewed
    if kind:
        items = [v for v in items if v.kind == kind]
    return items[:limit]


@recent_router.post("", response_model=list[RecentView])
def record_recently_viewed(
    body: RecordViewRequest, user: CurrentUser, state: StateDep
) -> list[RecentView]:
    """Record that the user opened an item (call on entering a detail view). Dedupes
    by (kind, ref_id), moves it to the front, and caps the list. Returns the updated
    rail so the client can refresh it in one round-trip."""
    if not body.kind.strip() or not body.ref_id.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind and ref_id are required")
    prof = _profile(state, user.id)
    prof.record_view(
        body.kind, body.ref_id, title=body.title, subtitle=body.subtitle, view=body.view
    )
    state.profiles.add(prof)
    return prof.recently_viewed[:12]


@recent_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_recently_viewed(user: CurrentUser, state: StateDep) -> None:
    """Clear the whole jump-back-in rail."""
    prof = _profile(state, user.id)
    if prof.recently_viewed:
        prof.recently_viewed = []
        state.profiles.add(prof)
