"""Peer practice interviews over WebRTC — invite, accept, signalling, questions."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    PracticeInviteRequest,
    PracticeSessionOut,
    SignalIn,
    SignalOut,
)
from jobsearch.models import PracticeSession

router = APIRouter(prefix="/api/v1/practice", tags=["practice"])


def _out(state: StateDep, s: PracticeSession, user_id: str) -> PracticeSessionOut:
    other_id = s.guest_id if s.host_id == user_id else s.host_id
    other = state.users.get(other_id)
    return PracticeSessionOut(
        id=s.id, host_id=s.host_id, guest_id=s.guest_id, status=s.status.value,
        i_am_host=s.host_id == user_id, other_name=(other.full_name or other.email) if other else "Someone",
        created_at=s.created_at.isoformat(),
    )


@router.get("", response_model=list[PracticeSessionOut])
def my_sessions(user: CurrentUser, state: StateDep) -> list[PracticeSessionOut]:
    return [_out(state, s, user.id) for s in state.practice.my_sessions(user.id)]


@router.post("", response_model=PracticeSessionOut, status_code=status.HTTP_201_CREATED)
def invite(body: PracticeInviteRequest, user: CurrentUser, state: StateDep) -> PracticeSessionOut:
    """Invite a connection to a live practice interview."""
    try:
        s = state.practice.invite(user.id, body.guest_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _out(state, s, user.id)


def _get_or_404(session_id: str, user: CurrentUser, state: StateDep) -> PracticeSession:
    s = state.practice.get(session_id, user.id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "practice session not found")
    return s


@router.get("/{session_id}", response_model=PracticeSessionOut)
def get_session(session_id: str, user: CurrentUser, state: StateDep) -> PracticeSessionOut:
    return _out(state, _get_or_404(session_id, user, state), user.id)


@router.post("/{session_id}/accept", response_model=PracticeSessionOut)
def accept(session_id: str, user: CurrentUser, state: StateDep) -> PracticeSessionOut:
    s = state.practice.accept(session_id, user.id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "practice session not found")
    return _out(state, s, user.id)


@router.post("/{session_id}/end", status_code=status.HTTP_204_NO_CONTENT)
def end(session_id: str, user: CurrentUser, state: StateDep) -> None:
    if not state.practice.end(session_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "practice session not found")


@router.get("/{session_id}/questions")
def questions(session_id: str, user: CurrentUser, state: StateDep) -> dict:
    _get_or_404(session_id, user, state)
    return {"questions": state.practice.questions(session_id)}


# --- WebRTC signalling (REST mailbox) ---------------------------------------
@router.post("/{session_id}/signal", status_code=status.HTTP_202_ACCEPTED)
def post_signal(session_id: str, body: SignalIn, user: CurrentUser, state: StateDep) -> dict:
    sig = state.practice.post_signal(session_id, user.id, body.kind, body.payload)
    if sig is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "practice session not found")
    return {"ok": True}


@router.get("/{session_id}/signals", response_model=list[SignalOut])
def get_signals(session_id: str, user: CurrentUser, state: StateDep) -> list[SignalOut]:
    """Poll (and consume) signalling messages addressed to me."""
    return [SignalOut(kind=m["kind"], payload=m["payload"], from_user=m["from"]) for m in state.practice.poll_signals(session_id, user.id)]
