"""Peer connections + direct messaging — invite, connect, message, share jobs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AcceptInviteRequest,
    ConnectionBrief,
    EmailInviteRequest,
    MessageOut,
    SendMessageRequest,
    SharedJobBrief,
)
from jobsearch.models import DirectMessage, Invite

router = APIRouter(prefix="/api/v1/social", tags=["social"])


def _brief(state: StateDep, user_id: str) -> ConnectionBrief:
    u = state.users.get(user_id)
    return ConnectionBrief(user_id=user_id, name=(u.full_name or u.email) if u else "Unknown")


def _msg_out(state: StateDep, m: DirectMessage, me: str) -> MessageOut:
    shared = None
    if m.shared_job_id:
        job = state.jobs.get(m.shared_job_id)
        if job is not None:
            shared = SharedJobBrief(id=job.id, title=job.title, company=job.company)
    return MessageOut(
        id=m.id, from_user_id=m.from_user_id, to_user_id=m.to_user_id, body=m.body,
        shared_job=shared, mine=m.from_user_id == me, created_at=m.created_at.isoformat(),
    )


# --- invites / connections --------------------------------------------------
@router.post("/invites", response_model=Invite, status_code=status.HTTP_201_CREATED)
def create_invite(user: CurrentUser, state: StateDep) -> Invite:
    """Create a share-code invite; pass the code/link to someone to connect."""
    return state.social.create_invite(user.id)


@router.get("/invites", response_model=list[Invite])
def list_invites(user: CurrentUser, state: StateDep) -> list[Invite]:
    return state.social.sent_invites(user.id)


@router.post("/invites/email")
def invite_by_email(body: EmailInviteRequest, user: CurrentUser, state: StateDep) -> dict:
    """Create an invite and email it (mock records it; http sends via your email
    API). Returns the code + link either way so it works with no email provider."""
    try:
        inv, link, sent = state.social.invite_by_email(user.id, body.email)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"code": inv.code, "link": link, "emailed": sent}


@router.post("/invites/accept", response_model=ConnectionBrief)
def accept_invite(body: AcceptInviteRequest, user: CurrentUser, state: StateDep) -> ConnectionBrief:
    try:
        conn = state.social.accept_invite(body.code.strip(), user.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    other = conn.user_b if conn.user_a == user.id else conn.user_a
    return _brief(state, other)


@router.get("/connections", response_model=list[ConnectionBrief])
def connections(user: CurrentUser, state: StateDep) -> list[ConnectionBrief]:
    return [ConnectionBrief(user_id=u.id, name=u.full_name or u.email) for u in state.social.connections_for(user.id)]


@router.delete("/connections/{other_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_connection(other_id: str, user: CurrentUser, state: StateDep) -> None:
    """Disconnect from a connection (either side can). They can reconnect later via
    a fresh invite. Use the block endpoints to also prevent reconnection/messaging."""
    if not state.social.remove_connection(user.id, other_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not connected")


# --- blocking ---------------------------------------------------------------
@router.get("/blocks", response_model=list[ConnectionBrief])
def list_blocks(user: CurrentUser, state: StateDep) -> list[ConnectionBrief]:
    """People you've blocked (you can unblock any of them)."""
    return [ConnectionBrief(user_id=u.id, name=u.full_name or u.email) for u in state.social.blocked_users(user.id)]


@router.post("/blocks/{other_id}", status_code=status.HTTP_204_NO_CONTENT)
def block_user(other_id: str, user: CurrentUser, state: StateDep) -> None:
    """Block someone: removes any connection and prevents messaging or reconnecting
    until you unblock. Silent — the blocked user isn't notified. Idempotent."""
    try:
        state.social.block(user.id, other_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.delete("/blocks/{other_id}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_user(other_id: str, user: CurrentUser, state: StateDep) -> None:
    """Lift a block you created (does not auto-reconnect — re-invite as usual). 404
    if you had not blocked them."""
    if not state.social.unblock(user.id, other_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not blocked")


# --- messaging --------------------------------------------------------------
@router.get("/threads")
def threads(user: CurrentUser, state: StateDep) -> list[dict]:
    return state.social.threads(user.id)


@router.get("/messages/{other_id}", response_model=list[MessageOut])
def conversation(other_id: str, user: CurrentUser, state: StateDep) -> list[MessageOut]:
    return [_msg_out(state, m, user.id) for m in state.social.conversation(user.id, other_id)]


@router.post("/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(body: SendMessageRequest, user: CurrentUser, state: StateDep) -> MessageOut:
    if body.shared_job_id and state.jobs.get(body.shared_job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "shared job not found")
    try:
        m = state.social.send_message(user.id, body.to_user_id, body=body.body, shared_job_id=body.shared_job_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _msg_out(state, m, user.id)
