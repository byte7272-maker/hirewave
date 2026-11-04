"""Admin — mint/list/revoke signup invites. Gated by the JOBSEARCH_ADMIN_TOKEN.

These endpoints let an operator hand out account-creation permission while signups
are gated (``signup_mode = "invite"``). Access requires the ``X-Admin-Token`` header
to match ``JOBSEARCH_ADMIN_TOKEN``; if that token is unset, all admin endpoints are
disabled (403), so they are safe by default.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from jobsearch.api.deps import StateDep
from jobsearch.api.schemas import InviteOut, MintInviteRequest
from jobsearch.engines import plans
from jobsearch.models import ResumeTemplate, SignupInvite
from jobsearch.models.common import utcnow

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


# --- prune seeded/demo job postings -----------------------------------------
# Fictional companies used only in dev/demo fixtures (TV/movie stand-ins).
_SEED_COMPANIES = {
    "hooli", "initech", "initechww", "globex", "umbrella", "umbrella software", "umbrella.dev",
    "stark industries", "northwind labs", "novacorp", "atlasco", "nimbusco",
    "virtucon", "wernham hogg", "pied piper", "soylent corp",
}
# Auto-generated junk titles/companies: ID suffixes (z/r + long digits, bare long digit
# runs), the joke "Subsea Kelp" role, and placeholder tokens (XYZ / QQ / ZZ / WW).
_SEED_JUNK = re.compile(r"(\b[zr]\d{6,}\b|\b\d{7,}\b|subsea kelp|\b(?:xyz|qq|zz|ww)\b)", re.I)


def _is_seed_job(job) -> bool:
    """True for a dev/demo posting (fictional company or auto-generated junk). Never
    matches a real posting (Sodexo, Accenture, …) or an inbox-sourced one."""
    if (job.source_platform or "").lower() in ("email", "match"):
        return False  # protect anything surfaced from a connected inbox
    if (job.company or "").strip().lower() in _SEED_COMPANIES:
        return True
    return bool(_SEED_JUNK.search(job.title or "") or _SEED_JUNK.search(job.company or ""))


@router.post("/prune-seed-jobs")
def prune_seed_jobs(
    state: StateDep, x_admin_token: str = Header(""), confirm: bool = False
) -> dict:
    """Remove seeded/demo job postings (fictional companies + auto-generated junk) from
    the shared pool so real matches aren't buried. Dry run by default: returns what WOULD
    be deleted (count + a sample). Pass ``confirm=true`` to actually delete. Inbox-sourced
    postings are never touched."""
    _require_admin(state, x_admin_token)
    all_jobs = state.jobs.all()
    targets = [j for j in all_jobs if _is_seed_job(j)]
    deleted = 0
    if confirm:
        for j in targets:
            if state.jobs.delete(j.id):
                deleted += 1
            state.verifications.pop(j.id, None)
    return {
        "total_jobs": len(all_jobs),
        "matched": len(targets),
        "deleted": deleted,
        "remaining": len(all_jobs) - deleted,
        "dry_run": not confirm,
        "sample": [f"{(j.title or '?')} @ {(j.company or '?')}" for j in targets[:20]],
    }


# --- account-type control (designate testers / trial / free at scale) -------
# The operator control for account tiers: set one account or a whole group, instead of
# hand-editing env allowlists. ``type`` is tester | trial | free | auto ("" = auto, i.e.
# trial-while-new then free). Gated by the admin token like everything else here.
_VALID_TYPES = {"tester", "trial", "free"}


class SetAccountTypeRequest(BaseModel):
    type: str
    email: Optional[str] = None
    user_id: Optional[str] = None


class BulkAccountTypeRequest(BaseModel):
    type: str
    #: Selection (combine freely). None/empty on all three = every account.
    domain: Optional[str] = None            # e.g. "acme.com" (exact email domain)
    signup_before: Optional[str] = None     # ISO date/datetime: accounts created before it
    emails: Optional[list[str]] = None      # explicit list


def _normalize_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    if t in ("auto", "", "none", "default"):
        return ""  # the AUTO sentinel
    if t in _VALID_TYPES:
        return t
    raise HTTPException(status.HTTP_400_BAD_REQUEST,
                        "type must be one of: tester, trial, free, auto")


def _effective(state, user) -> str:
    s = state.settings
    return plans.effective_tier(
        user,
        trial_days=getattr(s, "trial_days", plans.DEFAULT_TRIAL_DAYS),
        tester_emails=getattr(s, "tester_emails", []),
        tester_domains=getattr(s, "tester_domains", []),
    )


def _acct(user) -> dict:
    return {"email": user.email, "stored_type": (user.plan or "auto")}


def _parse_dt(raw: str) -> datetime:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad date: {raw}") from exc


@router.post("/accounts/type")
def set_account_type(
    body: SetAccountTypeRequest, state: StateDep, x_admin_token: str = Header("")
) -> dict:
    """Set one account's type (by email or user_id)."""
    _require_admin(state, x_admin_token)
    new_type = _normalize_type(body.type)
    user = None
    if body.user_id:
        user = state.users.get(body.user_id)
    elif body.email:
        user = state.user_by_email(body.email)
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "provide email or user_id")
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
    user.plan = new_type
    user.updated_at = utcnow()
    state.users.add(user)
    return {**_acct(user), "effective_type": _effective(state, user)}


@router.post("/accounts/bulk-type")
def bulk_set_account_type(
    body: BulkAccountTypeRequest, state: StateDep, x_admin_token: str = Header("")
) -> dict:
    """Set a whole group's type in one call: by domain, signup-before date, an explicit
    email list, or (no filter) everyone. Use this to grandfather early users as testers
    without tagging accounts one by one."""
    _require_admin(state, x_admin_token)
    new_type = _normalize_type(body.type)
    domain = (body.domain or "").strip().lower().lstrip("@")
    before = _parse_dt(body.signup_before) if body.signup_before else None
    wanted = {e.strip().lower() for e in (body.emails or []) if e.strip()}

    updated = 0
    for u in state.users.all():
        email = (u.email or "").lower()
        if domain and not email.endswith("@" + domain):
            continue
        if wanted and email not in wanted:
            continue
        if before is not None:
            created = getattr(u, "created_at", None)
            try:
                if created is None or not created < before:
                    continue
            except TypeError:  # tz mismatch
                if created is None or not created.replace(tzinfo=None) < before.replace(tzinfo=None):
                    continue
        u.plan = new_type
        u.updated_at = utcnow()
        state.users.add(u)
        updated += 1
    return {"updated": updated, "type": new_type or "auto"}


@router.get("/accounts")
def list_accounts(
    state: StateDep, x_admin_token: str = Header(""),
    effective_type: str = "", limit: int = 200,
) -> list[dict]:
    """List accounts with their stored override and current effective tier. Optionally
    filter by effective tier (tester / trial / free)."""
    _require_admin(state, x_admin_token)
    want = (effective_type or "").strip().lower()
    out: list[dict] = []
    for u in sorted(state.users.all(), key=lambda x: getattr(x, "created_at", utcnow())):
        row = {**_acct(u), "effective_type": _effective(state, u)}
        if want and row["effective_type"] != want:
            continue
        out.append(row)
        if len(out) >= max(1, limit):
            break
    return out
