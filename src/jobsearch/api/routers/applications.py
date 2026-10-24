"""§5.5 Applications."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    ApplicationCreate,
    ApplicationOut,
    BatchApplyOut,
    BatchApplyRequest,
    BatchApplyResult,
    JobCard,
    StatusUpdate,
    SubmitRequest,
    SubmitResponse,
)
from jobsearch.engines.automation import (
    ApplicationContext,
    ApprovalRequiredError,
    NoAdapterError,
    RateLimitError,
)
from jobsearch.models import Application, ApplicationStatus, Provider, UserProfile
from jobsearch.models.common import utcnow

router = APIRouter(prefix="/api/v1/applications", tags=["applications"])


def _owned(state: StateDep, user_id: str, application_id: str) -> Application:
    app = state.applications.get(application_id)
    if app is None or app.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "application not found")
    return app


def _norm_ident(s: str) -> str:
    return re.sub(r"\W+", " ", (s or "").lower()).strip()


def _resolve_job(state: StateDep, app: Application):
    """The application's job, made resilient to a stale/removed job_posting_id:
    - when the job exists, backfill the app's denormalized identity once (so it
      survives future consolidation/pruning);
    - when it's gone, re-point the app to a surviving posting matched on
      company+title (recovers an orphaned card). Returns the job or None."""
    job = state.jobs.get(app.job_posting_id)
    if job is not None:
        if not app.job_company and (job.company or job.title):
            app.job_company, app.job_title, app.job_url = job.company, job.title, (job.url or "")
            state.applications.add(app)
        return job
    if app.job_company or app.job_title:  # orphaned → find the surviving posting
        key = (_norm_ident(app.job_company), _norm_ident(app.job_title))
        match = next(
            (j for j in state.jobs.all()
             if (j.company or j.title) and (_norm_ident(j.company), _norm_ident(j.title)) == key),
            None,
        )
        if match is not None:
            app.job_posting_id = match.id
            app.updated_at = utcnow()
            state.applications.add(app)
            return match
    return None


def _out(state: StateDep, app: Application) -> ApplicationOut:
    """Attach the job's display fields (company, title, logo) to the application so
    an application card can render without a second fetch per row."""
    job = _resolve_job(state, app)
    return ApplicationOut(
        **app.model_dump(),
        job=JobCard.from_job(job) if job is not None else None,
    )


def _resolve_versions(state: StateDep, resume_id, cover_letter_id, resume_version, cover_letter_version):
    """The version of each document to record as applied — an explicit value wins,
    else the document's active version at apply time."""
    r_ver = resume_version
    if r_ver is None and resume_id:
        r = state.resumes.get(resume_id)
        r_ver = r.active_version if r else 0
    c_ver = cover_letter_version
    if c_ver is None and cover_letter_id:
        c = state.cover_letters.get(cover_letter_id)
        c_ver = c.active_version if c else 0
    return r_ver or 0, c_ver or 0


def _build_or_reuse_application(
    state: StateDep, user_id: str, *, job_posting_id: str,
    resume_id: str = "", cover_letter_id: str = "",
    resume_version=None, cover_letter_version=None, dedup: bool = False,
) -> tuple[Application, bool]:
    """Add the job to the pipeline with the chosen documents. When ``dedup`` and a
    draft for this job already exists, update that one instead of duplicating it
    (used by the apply wizard). Returns ``(application, reused)``."""
    r_ver, c_ver = _resolve_versions(state, resume_id, cover_letter_id, resume_version, cover_letter_version)
    existing = next(
        (a for a in state.applications.find(user_id=user_id)
         if a.job_posting_id == job_posting_id and a.status == ApplicationStatus.DRAFT),
        None,
    ) if dedup else None
    if existing is not None:
        if resume_id:
            existing.resume_id, existing.resume_version = resume_id, r_ver
        if cover_letter_id:
            existing.cover_letter_id, existing.cover_letter_version = cover_letter_id, c_ver
        existing.updated_at = utcnow()
        return state.applications.add(existing), True
    job = state.jobs.get(job_posting_id)
    app = Application(
        user_id=user_id, job_posting_id=job_posting_id,
        # Capture the job's identity so the application survives the posting being
        # consolidated/pruned and can be re-pointed later.
        job_company=(job.company if job else ""), job_title=(job.title if job else ""),
        job_url=((job.url or "") if job else ""),
        resume_id=resume_id, resume_version=r_ver,
        cover_letter_id=cover_letter_id, cover_letter_version=c_ver,
    )
    return state.applications.add(app), False


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def create_application(
    body: ApplicationCreate, user: CurrentUser, state: StateDep
) -> ApplicationOut:
    if state.jobs.get(body.job_posting_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    app, _ = _build_or_reuse_application(
        state, user.id, job_posting_id=body.job_posting_id,
        resume_id=body.resume_id or "", cover_letter_id=body.cover_letter_id or "",
        resume_version=body.resume_version, cover_letter_version=body.cover_letter_version,
    )
    return _out(state, app)


@router.get("", response_model=list[ApplicationOut])
def list_applications(
    user: CurrentUser, state: StateDep, status_filter: Optional[ApplicationStatus] = None
) -> list[ApplicationOut]:
    apps = state.applications.find(user_id=user.id)
    if status_filter is not None:
        apps = [a for a in apps if a.status == status_filter]
    return [_out(state, a) for a in apps]


@router.get("/{application_id}", response_model=ApplicationOut)
def get_application(application_id: str, user: CurrentUser, state: StateDep) -> ApplicationOut:
    return _out(state, _owned(state, user.id, application_id))


class _NeedsDocsError(RuntimeError):
    """The application can't be submitted yet (missing job or résumé)."""


def _submit_core(state: StateDep, user, app: Application, *, platform: str = ""):
    """Run the automated application for one app. Raises ``_NeedsDocsError`` when it
    lacks a job/résumé, or the automation engine's own exceptions
    (ApprovalRequired/NoAdapter/RateLimit). Persists the mutated app on success."""
    job = state.jobs.get(app.job_posting_id)
    resume = state.resumes.get(app.resume_id) if app.resume_id else None
    cover = state.cover_letters.get(app.cover_letter_id) if app.cover_letter_id else None
    if job is None or resume is None:
        raise _NeedsDocsError("application requires a job posting and a résumé before submitting")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    # In live mode, supply the user's decrypted Gmail token so the email adapter can
    # actually send (best-effort — a missing/expired connection falls through to manual).
    access_token = None
    if state.settings.automation_mode == "live":
        try:
            access_token = state.integration.get_access_token(user.id, Provider.GMAIL)
        except Exception:  # noqa: BLE001 - not connected / expired -> manual fallback
            access_token = None
    extra: dict = {}
    if platform:
        extra["platform"] = platform
    # Prefer the uploaded résumé bytes over the generated markdown.
    stored = state.documents.get(resume.id)
    if stored is not None:
        data, content_type = stored
        extra["resume_file"] = {
            "filename": resume.original_filename or f"resume.{resume.format.value}",
            "content_type": content_type, "data": data,
        }
    ctx = ApplicationContext(
        application=app, job=job, resume=resume, cover_letter=cover, profile=profile,
        applicant=user, access_token=access_token, extra=extra,
    )
    result = state.automation.submit(ctx)
    state.applications.add(app)  # engine mutated app (status/audit) — persist it
    return result


@router.put("/{application_id}/submit", response_model=SubmitResponse)
def submit(
    application_id: str, body: SubmitRequest, user: CurrentUser, state: StateDep
) -> SubmitResponse:
    app = _owned(state, user.id, application_id)
    try:
        result = _submit_core(state, user, app, platform=body.platform or "")
    except _NeedsDocsError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ApprovalRequiredError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except NoAdapterError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except RateLimitError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc
    return SubmitResponse(
        success=result.success,
        platform=result.platform,
        confirmation_id=result.confirmation_id,
        message=result.message,
        requires_manual=result.requires_manual,
        fallback_url=result.fallback_url,
        manual_steps=app.platform_response.get("manual_steps", []),
    )


@router.post("/batch", response_model=BatchApplyOut)
def batch_apply(body: BatchApplyRequest, user: CurrentUser, state: StateDep) -> BatchApplyOut:
    """Apply-wizard backend: add one or many jobs to the pipeline with the chosen
    résumé/cover letter, and (when ``submit``) start the automated application on each
    external site — all in one call. Per-job results so the wizard can show what
    succeeded, what needs a manual finish, and what failed. Idempotent: a job already
    in Draft is updated, not duplicated."""
    out = BatchApplyOut()
    for jid in dict.fromkeys(body.job_ids):  # de-dup the input list, keep order
        if not jid or state.jobs.get(jid) is None:
            out.results.append(BatchApplyResult(job_id=jid, error="job not found"))
            out.failed += 1
            continue
        app, reused = _build_or_reuse_application(
            state, user.id, job_posting_id=jid,
            resume_id=body.resume_id or "", cover_letter_id=body.cover_letter_id or "",
            resume_version=body.resume_version, cover_letter_version=body.cover_letter_version,
            dedup=True,
        )
        res = BatchApplyResult(job_id=jid, application_id=app.id, created=not reused, reused=reused)
        out.created += 1
        if body.submit:
            try:
                r = _submit_core(state, user, app, platform=body.platform or "")
                res.submitted = r.success
                res.requires_manual = r.requires_manual
                res.fallback_url = r.fallback_url or ""
                res.message = r.message or ""
                if r.success:
                    out.submitted += 1
                elif r.requires_manual:
                    out.manual += 1
            except (_NeedsDocsError, ApprovalRequiredError, NoAdapterError, RateLimitError) as exc:
                res.error = str(exc)
                res.requires_manual = True
                out.manual += 1
        out.results.append(res)
    return out


@router.put("/{application_id}/status", response_model=ApplicationOut)
def update_status(
    application_id: str, body: StatusUpdate, user: CurrentUser, state: StateDep
) -> ApplicationOut:
    app = _owned(state, user.id, application_id)
    app.status = body.status
    app.updated_at = utcnow()
    app.record_event("status_manual_update", status=body.status.value)
    return _out(state, state.applications.add(app))  # persist the mutation


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: str, user: CurrentUser, state: StateDep) -> None:
    app = _owned(state, user.id, application_id)
    state.applications.delete(app.id)
