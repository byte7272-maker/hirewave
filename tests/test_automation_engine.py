import pytest

from jobsearch.engines.automation import (
    ApplicationContext,
    ApprovalRequiredError,
    AutomationEngine,
    RateLimitError,
)
from jobsearch.engines.generation import GenerationEngine
from jobsearch.models import Application, ApplicationStatus, Notification


def _ctx(profile, job, *, approved: bool):
    gen = GenerationEngine()
    resume = gen.generate_resume(profile, job)
    cover = gen.generate_cover_letter(profile, job, resume=resume)
    if approved:
        gen.approve(resume)
        gen.approve(cover)
    app = Application(user_id=profile.user_id, job_posting_id=job.id, resume_id=resume.id)
    return ApplicationContext(
        application=app, job=job, resume=resume, cover_letter=cover, profile=profile
    )


def test_unapproved_submission_is_blocked(profile, matching_job):
    engine = AutomationEngine()
    ctx = _ctx(profile, matching_job, approved=False)
    with pytest.raises(ApprovalRequiredError):
        engine.submit(ctx)


def test_approved_submission_succeeds_and_audits(profile, matching_job):
    notes: list[Notification] = []
    engine = AutomationEngine(notifier=notes.append)
    ctx = _ctx(profile, matching_job, approved=True)
    result = engine.submit(ctx)

    assert result.success is True
    assert result.platform == "linkedin"
    assert ctx.application.status == ApplicationStatus.SUBMITTED
    assert ctx.application.submitted_at is not None
    # Audit trail recorded attempt + success.
    actions = [e["action"] for e in ctx.application.audit_trail]
    assert "submit_attempt" in actions and "submitted" in actions
    assert notes and notes[-1].message


def test_rate_limit_enforced(profile, matching_job):
    engine = AutomationEngine(max_submissions_per_hour=1)
    engine.submit(_ctx(profile, matching_job, approved=True))
    with pytest.raises(RateLimitError):
        engine.submit(_ctx(profile, matching_job, approved=True))


def test_no_adapter_produces_manual_fallback(profile, unrelated_job):
    # 'indeed' is supported; force an unsupported platform to hit fallback path.
    engine = AutomationEngine()
    ctx = _ctx(profile, unrelated_job, approved=True)
    ctx.job.source_platform = "some_unsupported_ats"
    ctx.job.company_domain = ""  # so EmailAdapter also declines
    with pytest.raises(Exception):
        engine.submit(ctx)
