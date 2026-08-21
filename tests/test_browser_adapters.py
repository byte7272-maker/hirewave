"""LinkedIn/Indeed browser adapters — safety orchestration via a fake driver.

No real browser, no network, no account. These prove the *decisions*: submit on
the happy path, and escalate to a manual fallback (never solve CAPTCHAs, never
fabricate answers, never enter passwords) on every unsafe branch.
"""

from __future__ import annotations

import pytest

from jobsearch.engines.automation import (
    ApplicationContext,
    ApprovalRequiredError,
    AutomationEngine,
    IndeedAdapter,
    LinkedInAdapter,
    application_fields,
)
from jobsearch.engines.automation.browser import FillOutcome
from jobsearch.engines.generation import GenerationEngine
from jobsearch.models import Application, User


class FakeDriver:
    """Configurable in-memory BrowserDriver."""

    def __init__(
        self,
        *,
        needs_login=False,
        captcha=False,
        apply_available=True,
        unknown_required=None,
        fill_captcha=False,
        confirmation="linkedin-submitted",
    ):
        self._needs_login = needs_login
        self._captcha = captcha
        self._apply_available = apply_available
        self._unknown = unknown_required or []
        self._fill_captcha = fill_captcha
        self._confirmation = confirmation
        self.calls: list[str] = []
        self.uploaded = None
        self.filled_fields = None

    def start(self):
        self.calls.append("start")

    def open(self, url):
        self.calls.append(f"open:{url}")

    def needs_login(self):
        return self._needs_login

    def has_captcha(self):
        return self._captcha

    def start_apply(self):
        self.calls.append("start_apply")
        return self._apply_available

    def fill_application(self, fields):
        self.calls.append("fill")
        self.filled_fields = fields
        return FillOutcome(
            filled=list(fields), unknown_required=self._unknown, captcha=self._fill_captcha
        )

    def upload_resume(self, filename, data):
        self.uploaded = (filename, len(data))
        return True

    def finalize(self):
        self.calls.append("finalize")
        return self._confirmation

    def close(self):
        self.calls.append("close")


def _applicant(profile):
    return User(
        id=profile.user_id,
        email="sam@demo.com",
        full_name="Sam Dev",
        phone="+1-555-0100",
        location="New York, NY",
    )


def _ctx(profile, job, *, driver, approved=True):
    gen = GenerationEngine()
    resume = gen.generate_resume(profile, job)
    cover = gen.generate_cover_letter(profile, job, resume=resume)
    if approved:
        gen.approve(resume)
        gen.approve(cover)
    app = Application(user_id=profile.user_id, job_posting_id=job.id, resume_id=resume.id)
    return ApplicationContext(
        application=app,
        job=job,
        resume=resume,
        cover_letter=cover,
        profile=profile,
        applicant=_applicant(profile),
        extra={"platform": job.source_platform},
    ), driver


def _engine(driver):
    return AutomationEngine(adapters=[LinkedInAdapter(mode="live", driver=driver)])


# --- happy path -------------------------------------------------------------
def test_successful_easy_apply(profile, matching_job):
    driver = FakeDriver(confirmation="li-123")
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)

    assert result.success is True
    assert result.confirmation_id == "li-123"
    assert driver.calls[-1] == "close"
    assert "finalize" in driver.calls
    assert driver.uploaded is not None  # resume uploaded
    # Only factual fields were offered to the form.
    assert driver.filled_fields["email"] == "sam@demo.com"
    assert driver.filled_fields["phone"] == "+1-555-0100"
    assert ctx.application.status.value == "submitted"


def test_application_fields_are_factual_only(profile, matching_job):
    ctx, _ = _ctx(profile, matching_job, driver=FakeDriver())
    fields = application_fields(ctx)
    assert set(fields).issubset({"name", "email", "phone", "location"})
    assert fields["name"] == "Sam Dev"


# --- safety escalations -----------------------------------------------------
def test_login_wall_escalates_without_entering_password(profile, matching_job):
    driver = FakeDriver(needs_login=True)
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)
    assert result.success is False
    assert result.requires_manual is True
    assert "start_apply" not in driver.calls  # never tried to apply / type anything
    assert "finalize" not in driver.calls


def test_captcha_is_escalated_not_solved(profile, matching_job):
    driver = FakeDriver(captcha=True)
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)
    assert result.captcha_required is True
    assert result.requires_manual is True
    assert "finalize" not in driver.calls  # never submitted


def test_captcha_mid_form_is_escalated(profile, matching_job):
    driver = FakeDriver(fill_captcha=True)
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)
    assert result.captcha_required is True
    assert "finalize" not in driver.calls


def test_unknown_required_question_is_not_fabricated(profile, matching_job):
    driver = FakeDriver(unknown_required=["Years of Java experience", "Salary expectation"])
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)
    assert result.success is False
    assert result.requires_manual is True
    assert "won't answer on your behalf" in result.message
    assert "finalize" not in driver.calls  # bailed before submitting


def test_apply_button_absent_falls_back(profile, matching_job):
    driver = FakeDriver(apply_available=False)
    ctx, _ = _ctx(profile, matching_job, driver=driver)
    result = _engine(driver).submit(ctx)
    assert result.success is False
    assert result.requires_manual is True
    assert "finalize" not in driver.calls


def test_approval_gate_blocks_before_touching_browser(profile, matching_job):
    driver = FakeDriver()
    ctx, _ = _ctx(profile, matching_job, driver=driver, approved=False)
    with pytest.raises(ApprovalRequiredError):
        _engine(driver).submit(ctx)
    assert driver.calls == []  # browser never even started


def test_indeed_adapter_uses_same_flow(profile, unrelated_job):
    unrelated_job.source_platform = "indeed"
    driver = FakeDriver(confirmation="indeed-ok")
    ctx, _ = _ctx(profile, unrelated_job, driver=driver)
    engine = AutomationEngine(adapters=[IndeedAdapter(mode="live", driver=driver)])
    result = engine.submit(ctx)
    assert result.success is True and result.platform == "indeed"


# --- graceful degradation when Playwright isn't installed -------------------
def test_missing_playwright_degrades_to_manual(profile, matching_job):
    # No driver injected + no factory -> tries to build PlaywrightDriver.
    engine = AutomationEngine(adapters=[LinkedInAdapter(mode="live")])
    ctx, _ = _ctx(profile, matching_job, driver=None)
    result = engine.submit(ctx)
    # Playwright isn't installed in this env -> engine converts the error to a
    # manual fallback rather than crashing.
    assert result.success is False
    assert result.requires_manual is True
