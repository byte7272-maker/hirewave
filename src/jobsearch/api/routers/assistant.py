"""Permissioned automation assistant — consent, auto form-fill, audit log."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AutofillRequest,
    AutomationActionOut,
    ConsentOut,
    ConsentUpdate,
    ExecuteFillRequest,
    FillEntryOut,
    FillPlanOut,
    LiveFillResultOut,
    PrepareDraftsOut,
    PrepareDraftsRequest,
)
from jobsearch.engines.assistant import FormField, build_browser_driver, demo_application_form
from jobsearch.models import AUTOMATION_SCOPES, UserProfile

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


@router.get("/consent", response_model=ConsentOut)
def get_consent(user: CurrentUser, state: StateDep) -> ConsentOut:
    con = state.assistant.get_consent(user.id)
    return ConsentOut(granted=con.scopes, available=AUTOMATION_SCOPES)


@router.put("/consent", response_model=ConsentOut)
def set_consent(body: ConsentUpdate, user: CurrentUser, state: StateDep) -> ConsentOut:
    con = state.assistant.set_consent(user.id, body.scopes)
    return ConsentOut(granted=con.scopes, available=AUTOMATION_SCOPES)


@router.get("/actions", response_model=list[AutomationActionOut])
def actions(user: CurrentUser, state: StateDep) -> list[AutomationActionOut]:
    return [
        AutomationActionOut(id=a.id, kind=a.kind, job_id=a.job_id, status=a.status, detail=a.detail, created_at=a.created_at.isoformat())
        for a in state.assistant.actions_for(user.id)
    ]


def _require_autofill(user, state) -> None:
    if not state.assistant.has(user.id, "form_autofill"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant the 'form_autofill' permission in Assistant settings first")


def _job_or_404(job_id: str, state):
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _prepare(job_id, user, state, fields_in):
    account = state.users.get(user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    fields = [FormField(f.name, f.label, f.type, f.required) for f in fields_in] if fields_in else demo_application_form()
    resumes = state.resumes.find(user_id=user.id)
    resume_name = ""
    resume_data = b""
    if resumes:
        latest = sorted(resumes, key=lambda r: r.id)[-1]
        resume_name = latest.original_filename or f"{latest.target_role or 'résumé'}.md"
        try:
            stored = state.documents.get(latest.id)  # (bytes, content_type) | None
            resume_data = stored[0] if stored else b""
        except Exception:  # noqa: BLE001 - upload store optional
            resume_data = b""
    covers = state.cover_letters.find(user_id=user.id)
    cover_text = sorted(covers, key=lambda c: c.id)[-1].content if covers else ""
    plan = state.assistant.autofill(account, profile, fields, job_id=job_id, resume_name=resume_name, cover_text=cover_text)
    return account, plan, resume_name, resume_data


@router.post("/prepare-drafts", response_model=PrepareDraftsOut)
def prepare_drafts(body: PrepareDraftsRequest, user: CurrentUser, state: StateDep) -> PrepareDraftsOut:
    """Auto-prepare application drafts (résumé + cover letter) for your strong
    matches. Requires the ``draft_prep`` permission. Drafts still need your
    approval before anything is submitted."""
    if not state.assistant.has(user.id, "draft_prep"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant the 'draft_prep' permission in Assistant settings first")
    apps = state.draft_prep.run(user.id, min_fit=body.min_fit, limit=body.limit)
    return PrepareDraftsOut(prepared=len(apps), application_ids=[a.id for a in apps])


@router.post("/autofill/{job_id}", response_model=FillPlanOut)
def autofill(job_id: str, body: AutofillRequest, user: CurrentUser, state: StateDep) -> FillPlanOut:
    """Preview how the assistant would fill a job's application form from your
    profile. Requires the ``form_autofill`` permission. Credential fields are
    always refused; unknown fields are flagged for you — nothing is submitted."""
    _require_autofill(user, state)
    _job_or_404(job_id, state)
    _account, plan, _rn, _rd = _prepare(job_id, user, state, body.fields)
    return FillPlanOut(
        entries=[FillEntryOut(field=e.field, label=e.label, value=e.value, source=e.source, status=e.status, reason=e.reason) for e in plan.entries],
        filled=plan.filled, blocked=plan.blocked, needs_input=plan.needs_input,
    )


@router.post("/autofill/{job_id}/execute", response_model=LiveFillResultOut)
def execute(job_id: str, body: ExecuteFillRequest, user: CurrentUser, state: StateDep) -> LiveFillResultOut:
    """Drive a browser to fill (and optionally submit) the application, from the
    reviewed plan. Requires ``form_autofill``; submitting also requires
    ``submit_after_review``. Credential fields never reach the browser; a login
    wall or CAPTCHA is escalated back to you, never solved."""
    _require_autofill(user, state)
    if body.submit and not state.assistant.has(user.id, "submit_after_review"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant 'submit_after_review' to let the assistant submit")
    job = _job_or_404(job_id, state)
    account, plan, resume_name, resume_data = _prepare(job_id, user, state, None)
    driver, live = build_browser_driver(state.settings, platform=job.source_platform)
    result = state.assistant.execute_fill(
        account, plan, driver, url=job.url, submit=body.submit, job_id=job_id,
        resume_name=resume_name, resume_data=resume_data, live=live,
    )
    return LiveFillResultOut(
        status=result.status, filled=result.filled, unknown_required=result.unknown_required,
        confirmation=result.confirmation, detail=result.detail, live=result.live,
    )
