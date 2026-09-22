"""Admin — mint/list/revoke signup invites. Gated by the JOBSEARCH_ADMIN_TOKEN.

These endpoints let an operator hand out account-creation permission while signups
are gated (``signup_mode = "invite"``). Access requires the ``X-Admin-Token`` header
to match ``JOBSEARCH_ADMIN_TOKEN``; if that token is unset, all admin endpoints are
disabled (403), so they are safe by default.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Header, HTTPException, status

from jobsearch.api.deps import StateDep
from jobsearch.api.schemas import InviteOut, MintInviteRequest
from jobsearch.models import ResumeTemplate, SignupInvite

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(state: StateDep, x_admin_token: str = Header("")) -> None:
    token = state.settings.admin_token
    if not token or not secrets.compare_digest(x_admin_token or "", token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _out(inv: SignupInvite) -> InviteOut:
    return InviteOut(
        id=inv.id, code=inv.code, label=inv.label, max_uses=inv.max_uses,
        uses=inv.uses, active=inv.active,
        expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
    )


@router.post("/invites", response_model=list[InviteOut], status_code=status.HTTP_201_CREATED)
def mint_invites(
    body: MintInviteRequest, state: StateDep, x_admin_token: str = Header("")
) -> list[InviteOut]:
    """Mint one or more invite codes that authorize account creation."""
    _require_admin(state, x_admin_token)
    invites = state.signup.mint(
        label=body.label, max_uses=body.max_uses, ttl_hours=body.ttl_hours, count=body.count,
    )
    return [_out(i) for i in invites]


@router.get("/invites", response_model=list[InviteOut])
def list_invites(state: StateDep, x_admin_token: str = Header("")) -> list[InviteOut]:
    _require_admin(state, x_admin_token)
    return [_out(i) for i in state.signup.list()]


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(invite_id: str, state: StateDep, x_admin_token: str = Header("")) -> None:
    _require_admin(state, x_admin_token)
    if not state.signup.revoke(invite_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invite not found")


# --- community résumé-template moderation -----------------------------------
@router.get("/templates", response_model=list[ResumeTemplate])
def list_templates_for_review(
    state: StateDep, x_admin_token: str = Header(""), status_filter: str = "pending"
) -> list[ResumeTemplate]:
    """Community templates awaiting review (default) or by status (pending/approved/
    rejected/flagged). 'flagged' returns anything with reports."""
    _require_admin(state, x_admin_token)
    items = state.resume_templates.all()
    if status_filter == "flagged":
        items = [t for t in items if t.flags > 0]
    elif status_filter in ("pending", "approved", "rejected"):
        items = [t for t in items if t.status == status_filter]
    return sorted(items, key=lambda t: (-t.flags, t.created_at))


def _set_template_status(state: StateDep, template_id: str, new_status: str) -> ResumeTemplate:
    tpl = state.resume_templates.get(template_id)
    if tpl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    tpl.status = new_status
    if new_status == "approved":
        tpl.flags = 0  # clear reports on approval
    return state.resume_templates.add(tpl)


@router.post("/templates/{template_id}/approve", response_model=ResumeTemplate)
def approve_template(
    template_id: str, state: StateDep, x_admin_token: str = Header("")
) -> ResumeTemplate:
    _require_admin(state, x_admin_token)
    return _set_template_status(state, template_id, "approved")


@router.post("/templates/{template_id}/reject", response_model=ResumeTemplate)
def reject_template(
    template_id: str, state: StateDep, x_admin_token: str = Header("")
) -> ResumeTemplate:
    _require_admin(state, x_admin_token)
    return _set_template_status(state, template_id, "rejected")
