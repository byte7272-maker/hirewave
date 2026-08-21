"""§5.5 Applications."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    ApplicationCreate,
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


@router.post("", response_model=Application, status_code=status.HTTP_201_CREATED)
def create_application(
    body: ApplicationCreate, user: CurrentUser, state: StateDep
) -> Application:
    if state.jobs.get(body.job_posting_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    app = Application(
        user_id=user.id,
        job_posting_id=body.job_posting_id,
        resume_id=body.resume_id,
        cover_letter_id=body.cover_letter_id,
    )
    return state.applications.add(app)


@router.get("", response_model=list[Application])
def list_applications(
    user: CurrentUser, state: StateDep, status_filter: Optional[ApplicationStatus] = None
) -> list[Application]:
    apps = state.applications.find(user_id=user.id)
    if status_filter is not None:
        apps = [a for a in apps if a.status == status_filter]
    return apps


@router.get("/{application_id}", response_model=Application)
def get_application(application_id: str, user: CurrentUser, state: StateDep) -> Application:
    return _owned(state, user.id, application_id)


@router.put("/{application_id}/submit", response_model=SubmitResponse)
def submit(
    application_id: str, body: SubmitRequest, user: CurrentUser, state: StateDep
) -> SubmitResponse:
    app = _owned(state, user.id, application_id)
    job = state.jobs.get(app.job_posting_id)
    resume = state.resumes.get(app.resume_id) if app.resume_id else None
    cover = state.cover_letters.get(app.cover_letter_id) if app.cover_letter_id else None
    if job is None or resume is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "application requires a job posting and a generated resume before submitting",
        )
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)

    # In live mode, supply the user's decrypted Gmail token so the email adapter
    # can actually send (best-effort — a missing/expired connection just falls
    # through to the manual fallback path).
    access_token = None
    if state.settings.automation_mode == "live":
        try:
            access_token = state.integration.get_access_token(user.id, Provider.GMAIL)
        except Exception:  # noqa: BLE001 - not connected / expired -> manual fallback
            access_token = None

    extra: dict = {}
    if body.platform:
        extra["platform"] = body.platform
    # If the résumé is an uploaded file, attach the real bytes (adapters prefer
    # this over the generated markdown).
    stored = state.documents.get(resume.id)
    if stored is not None:
        data, content_type = stored
        extra["resume_file"] = {
            "filename": resume.original_filename or f"resume.{resume.format.value}",
            "content_type": content_type,
            "data": data,
        }

    ctx = ApplicationContext(
        application=app,
        job=job,
        resume=resume,
        cover_letter=cover,
        profile=profile,
        applicant=user,  # name/email/phone for browser application forms
        access_token=access_token,
        extra=extra,
    )
    try:
        result = state.automation.submit(ctx)
    except ApprovalRequiredError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except NoAdapterError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except RateLimitError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc

    # The automation engine mutated `app` in place (status, audit trail,
    # platform_response) — persist that back to the repository.
    state.applications.add(app)

    return SubmitResponse(
        success=result.success,
        platform=result.platform,
        confirmation_id=result.confirmation_id,
        message=result.message,
        requires_manual=result.requires_manual,
        fallback_url=result.fallback_url,
        manual_steps=app.platform_response.get("manual_steps", []),
    )


@router.put("/{application_id}/status", response_model=Application)
def update_status(
    application_id: str, body: StatusUpdate, user: CurrentUser, state: StateDep
) -> Application:
    app = _owned(state, user.id, application_id)
    app.status = body.status
    app.updated_at = utcnow()
    app.record_event("status_manual_update", status=body.status.value)
    return state.applications.add(app)  # persist the mutation


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: str, user: CurrentUser, state: StateDep) -> None:
    app = _owned(state, user.id, application_id)
    state.applications.delete(app.id)
