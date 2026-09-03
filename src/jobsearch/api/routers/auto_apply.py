"""Connected sessions + standing auto-apply grants.

The user connects a provider session themselves (password never leaves their
machine — see ``python -m jobsearch.connect``), then creates *grants* that
pre-authorize the assistant to submit to specific jobs or a matching group,
within hard limits. Every submission is still audited and guardrailed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AutoApplyCriteriaIn,
    BrowserSessionOut,
    ConnectIntentRequest,
    ConnectSessionRequest,
    ConnectSubmit,
    CreateGrantRequest,
    GrantOut,
    JobOutcomeOut,
    QueueItemOut,
    RunGrantRequest,
    RunResultOut,
    UpdateGrantStatusRequest,
)
from jobsearch.models import AutoApplyCriteria
from jobsearch.models.auto_apply import GRANT_ACTIVE, GRANT_PAUSED, GRANT_REVOKED

router = APIRouter(prefix="/api/v1/auto-apply", tags=["auto-apply"])


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _parse_expiry(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"invalid expires_at: {exc}")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _session_out(s) -> BrowserSessionOut:
    return BrowserSessionOut(
        provider=s.provider, label=s.label, status=s.status,
        created_at=s.created_at.isoformat(), updated_at=s.updated_at.isoformat(),
        last_used_at=_iso(s.last_used_at), expires_at=_iso(s.expires_at),
    )


def _grant_out(g) -> GrantOut:
    return GrantOut(
        id=g.id, name=g.name, scope=g.scope, job_ids=g.job_ids,
        criteria=AutoApplyCriteriaIn(**g.criteria.model_dump()),
        require_verified=g.require_verified, max_submits=g.max_submits, daily_cap=g.daily_cap,
        submits_used=g.submits_used, submitted_today=g.submitted_today,
        remaining_total=g.remaining_total, status=g.status,
        mode=g.mode, interval_minutes=g.interval_minutes,
        expires_at=_iso(g.expires_at), created_at=g.created_at.isoformat(),
        last_run_at=_iso(g.last_run_at),
    )


def _queue_out(q) -> QueueItemOut:
    return QueueItemOut(
        job_id=q.job_id, title=q.title, company=q.company, url=q.url,
        provider=q.provider, grant_id=q.grant_id, fields=q.fields, resume_name=q.resume_name,
    )


def _run_out(r) -> RunResultOut:
    return RunResultOut(
        grant_id=r.grant_id, dry_run=r.dry_run, eligible=r.eligible, attempted=r.attempted,
        submitted=r.submitted, remaining_total=r.remaining_total, remaining_today=r.remaining_today,
        grant_status=r.grant_status, detail=r.detail,
        outcomes=[JobOutcomeOut(job_id=o.job_id, title=o.title, company=o.company, status=o.status, detail=o.detail) for o in r.outcomes],
    )


# ---- connected sessions ---------------------------------------------------
@router.post("/sessions", response_model=BrowserSessionOut)
def connect_session(body: ConnectSessionRequest, user: CurrentUser, state: StateDep) -> BrowserSessionOut:
    """Store a provider session the user established locally (cookies only,
    encrypted at rest). Never receives or stores a password."""
    if not body.storage_state.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "storage_state is empty")
    sess = state.auto_apply.connect_session(user.id, body.provider, body.storage_state, label=body.label)
    return _session_out(sess)


@router.get("/sessions", response_model=list[BrowserSessionOut])
def list_sessions(user: CurrentUser, state: StateDep) -> list[BrowserSessionOut]:
    return [_session_out(s) for s in state.auto_apply.list_sessions(user.id)]


@router.post("/sessions/connect-intent")
def create_connect_intent(
    body: ConnectIntentRequest, user: CurrentUser, state: StateDep
) -> dict:
    """Start a minimal-footprint connect: issue a short-lived pairing code the
    capture helper submits the session against. The app then polls status."""
    intent = state.auto_apply.create_connect_intent(user.id, body.provider)
    return {
        "code": intent.code,
        "provider": intent.provider,
        "status": intent.status,
        "expires_at": intent.expires_at.isoformat() if intent.expires_at else None,
    }


@router.post("/sessions/connect")
def submit_connect(body: ConnectSubmit, state: StateDep) -> dict:
    """Capture helper endpoint — **no login token required**; the pairing code
    authorizes creating the session for the user who started the connect. Only a
    cookie ``storage_state`` is accepted (never a password)."""
    try:
        intent = state.auto_apply.complete_connect(body.code, body.storage_state, label=body.label)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"status": intent.status, "provider": intent.provider}


@router.get("/sessions/connect-intent/{code}")
def connect_status(code: str, user: CurrentUser, state: StateDep) -> dict:
    """The app polls this until ``status`` becomes ``connected`` (or ``expired``)."""
    intent = state.auto_apply.connect_status(user.id, code)
    if intent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "connect code not found")
    return {"status": intent.status, "provider": intent.provider, "session_id": intent.session_id}


@router.delete("/sessions/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_session(provider: str, user: CurrentUser, state: StateDep) -> None:
    state.auto_apply.disconnect_session(user.id, provider)


# ---- grants ---------------------------------------------------------------
@router.post("/grants", response_model=GrantOut)
def create_grant(body: CreateGrantRequest, user: CurrentUser, state: StateDep) -> GrantOut:
    if body.scope not in ("jobs", "criteria"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "scope must be 'jobs' or 'criteria'")
    if body.scope == "jobs" and not body.job_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "scope 'jobs' needs job_ids")
    grant = state.auto_apply.create_grant(
        user.id, name=body.name, scope=body.scope, job_ids=body.job_ids,
        criteria=AutoApplyCriteria(**body.criteria.model_dump()),
        require_verified=body.require_verified, max_submits=body.max_submits,
        daily_cap=body.daily_cap, expires_at=_parse_expiry(body.expires_at),
        mode=body.mode, interval_minutes=body.interval_minutes,
    )
    return _grant_out(grant)


@router.get("/grants", response_model=list[GrantOut])
def list_grants(user: CurrentUser, state: StateDep) -> list[GrantOut]:
    return [_grant_out(g) for g in state.auto_apply.list_grants(user.id)]


def _grant_or_404(grant_id: str, user, state):
    g = state.auto_apply.get_grant(grant_id, user.id)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "grant not found")
    return g


@router.get("/grants/{grant_id}", response_model=GrantOut)
def get_grant(grant_id: str, user: CurrentUser, state: StateDep) -> GrantOut:
    return _grant_out(_grant_or_404(grant_id, user, state))


@router.patch("/grants/{grant_id}", response_model=GrantOut)
def update_grant(grant_id: str, body: UpdateGrantStatusRequest, user: CurrentUser, state: StateDep) -> GrantOut:
    if body.status not in (GRANT_ACTIVE, GRANT_PAUSED, GRANT_REVOKED):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status must be active | paused | revoked")
    _grant_or_404(grant_id, user, state)
    return _grant_out(state.auto_apply.set_status(grant_id, user.id, body.status))


@router.delete("/grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grant(grant_id: str, user: CurrentUser, state: StateDep) -> None:
    if not state.auto_apply.delete_grant(grant_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "grant not found")


@router.post("/grants/{grant_id}/run", response_model=RunResultOut)
def run_grant(grant_id: str, body: RunGrantRequest, user: CurrentUser, state: StateDep) -> RunResultOut:
    """Execute the grant now — dry_run previews the jobs it would submit to
    without doing anything; otherwise it submits within the grant's limits.
    Assisted/LinkedIn jobs are queued (see /queue), never auto-submitted."""
    grant = _grant_or_404(grant_id, user, state)
    result = state.auto_apply.run_grant(grant, dry_run=body.dry_run, limit=body.limit)
    return _run_out(result)


@router.post("/run-due", response_model=list[RunResultOut])
def run_due(user: CurrentUser, state: StateDep) -> list[RunResultOut]:
    """Run all of the user's grants whose cadence is due. Safe to poll; a
    scheduler can also call it. Returns a RunResult per grant that ran."""
    return [_run_out(r) for r in state.auto_apply.run_due(user.id)]


@router.get("/queue", response_model=list[QueueItemOut])
def apply_queue(user: CurrentUser, state: StateDep) -> list[QueueItemOut]:
    """Jobs awaiting your manual Apply click (assisted mode / LinkedIn), each
    with the field values automation will fill once you open the form. The
    local `jobsearch.assist` agent consumes this."""
    return [_queue_out(q) for q in state.auto_apply.queue(user.id)]
