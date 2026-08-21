"""WebRTC ICE configuration (STUN + optional TURN with per-user short-lived creds)."""

from __future__ import annotations

from fastapi import APIRouter

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.webrtc import build_ice_servers

router = APIRouter(prefix="/api/v1/webrtc", tags=["webrtc"])


@router.get("/ice-servers")
def ice_servers(user: CurrentUser, state: StateDep) -> dict:
    """ICE servers for a peer call — public STUN plus a TURN relay when
    configured. TURN credentials (when a secret is set) are short-lived and
    minted per request; the static secret never reaches the client."""
    return {"ice_servers": build_ice_servers(state.settings, user_id=user.id)}
