"""Live email submission via Gmail — offline (fake Gmail client, no network)."""

from __future__ import annotations

import base64
import email

import pytest

from jobsearch.engines.automation import (
    ApplicationContext,
    AutomationEngine,
    EmailAdapter,
    build_raw_message,
)
from jobsearch.engines.automation.gmail import Attachment
from jobsearch.engines.generation import GenerationEngine
from jobsearch.models import Application


class FakeGmail:
    def __init__(self, message_id: str = "gmail-msg-123") -> None:
        self.sent: list[tuple[str, str]] = []
        self._id = message_id

    def send_raw(self, access_token: str, raw_b64: str) -> dict:
        self.sent.append((access_token, raw_b64))
        return {"id": self._id, "threadId": "t1", "labelIds": ["SENT"]}


def _ctx(profile, job, *, approved=True, access_token="tok", to=None):
    gen = GenerationEngine()
    resume = gen.generate_resume(profile, job)
    cover = gen.generate_cover_letter(profile, job, resume=resume)
    if approved:
        gen.approve(resume)
        gen.approve(cover)
    app = Application(user_id=profile.user_id, job_posting_id=job.id, resume_id=resume.id)
    extra = {"platform": "email"}
    if to:
        extra["to"] = to
    return ApplicationContext(
        application=app,
        job=job,
        resume=resume,
        cover_letter=cover,
        profile=profile,
        access_token=access_token,
        extra=extra,
    )


# --- MIME building ----------------------------------------------------------
def test_build_raw_message_roundtrips():
    raw = build_raw_message(
        to="jobs@acme.com",
        subject="Application",
        body="Dear team,\nHello.",
        attachments=[Attachment("resume.md", b"# Resume\nSkills: Python")],
    )
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "jobs@acme.com"
    assert msg["Subject"] == "Application"
    parts = list(msg.walk())
    filenames = [p.get_filename() for p in parts if p.get_filename()]
    assert "resume.md" in filenames


# --- live send --------------------------------------------------------------
def test_live_email_sends_via_gmail(profile, matching_job):
    fake = FakeGmail()
    engine = AutomationEngine(adapters=[EmailAdapter(mode="live", gmail_client=fake)])
    ctx = _ctx(profile, matching_job, to="hiring@globex.com")

    result = engine.submit(ctx)
    assert result.success is True
    assert result.platform == "email"
    assert result.confirmation_id == "gmail-msg-123"
    assert "hiring@globex.com" in result.message

    # The real token was used and a well-formed message was sent.
    token, raw = fake.sent[0]
    assert token == "tok"
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "hiring@globex.com"
    # Application record marked submitted + audited.
    assert ctx.application.status.value == "submitted"


def test_recipient_falls_back_to_company_domain(profile, matching_job):
    fake = FakeGmail()
    adapter = EmailAdapter(mode="live", gmail_client=fake)
    ctx = _ctx(profile, matching_job)  # no explicit "to"; job has company_domain globex.com
    adapter.submit(ctx)
    _, raw = fake.sent[0]
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "careers@globex.com"


def test_application_email_field_preferred(profile, matching_job):
    fake = FakeGmail()
    matching_job.application_email = "apply@globex.com"
    adapter = EmailAdapter(mode="live", gmail_client=fake)
    ctx = ApplicationContext(
        application=Application(user_id=profile.user_id, job_posting_id=matching_job.id),
        job=matching_job,
        resume=GenerationEngine().generate_resume(profile, matching_job),
        profile=profile,
        access_token="tok",
    )
    adapter.submit(ctx)
    _, raw = fake.sent[0]
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "apply@globex.com"


# --- safety / fallback ------------------------------------------------------
def test_no_token_yields_manual_fallback(profile, matching_job):
    engine = AutomationEngine(adapters=[EmailAdapter(mode="live", gmail_client=FakeGmail())])
    ctx = _ctx(profile, matching_job, access_token=None, to="x@y.com")
    result = engine.submit(ctx)
    assert result.success is False
    assert result.requires_manual is True
    assert result.fallback_url  # user gets a link to finish manually


def test_unapproved_blocked_even_in_live_mode(profile, matching_job):
    from jobsearch.engines.automation import ApprovalRequiredError

    engine = AutomationEngine(adapters=[EmailAdapter(mode="live", gmail_client=FakeGmail())])
    ctx = _ctx(profile, matching_job, approved=False, to="x@y.com")
    with pytest.raises(ApprovalRequiredError):
        engine.submit(ctx)
    # Nothing was sent.
    assert engine.adapters[0]._gmail.sent == []


# --- API-level: live mode without a Gmail connection degrades gracefully ----
def test_api_live_mode_without_gmail_falls_back():
    from fastapi.testclient import TestClient

    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState
    from jobsearch.config import Settings
    from jobsearch.engines.integration import MockTokenExchanger

    settings = Settings(automation_mode="live", llm_provider="mock", embedding_provider="mock")
    client = TestClient(
        create_app(state=AppState(settings=settings, exchanger=MockTokenExchanger()))
    )
    client.post(
        "/api/v1/auth/register",
        json={"email": "sam@demo.com", "password": "supersecret", "full_name": "Sam"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    client.put("/api/v1/users/me", headers=h, json={"skills": ["Python", "FastAPI"]})
    client.post(
        "/api/v1/jobs/ingest",
        headers=h,
        json={
            "jobs": [
                {
                    "source_platform": "linkedin",
                    "title": "Backend Engineer",
                    "company": "Globex",
                    "company_domain": "globex.com",
                    "description": "Python FastAPI",
                    "requirements": ["Python"],
                    "url": "https://x/1",
                }
            ]
        },
    )
    job_id = client.get("/api/v1/jobs/matches", headers=h).json()[0]["job_id"]
    resume = client.post(
        "/api/v1/resumes/generate", headers=h, json={"job_posting_id": job_id}
    ).json()
    client.put(f"/api/v1/resumes/{resume['id']}", headers=h, json={"approved": True})
    app = client.post(
        "/api/v1/applications",
        headers=h,
        json={"job_posting_id": job_id, "resume_id": resume["id"]},
    ).json()

    # Force the email adapter; no Gmail connected -> no token -> manual fallback.
    r = client.put(
        f"/api/v1/applications/{app['id']}/submit", headers=h, json={"platform": "email"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert body["requires_manual"] is True
    assert body["manual_steps"]  # user gets step-by-step instructions

    # A failure notification was recorded.
    notes = client.get("/api/v1/notifications", headers=h).json()
    assert any(n["type"] == "application_failed" for n in notes)
