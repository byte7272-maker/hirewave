"""Emailed application-status updates — consent (off by default) + delivery."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


class _Capture:
    def __init__(self):
        self.sent = []

    def send(self, *, to, subject, body):
        self.sent.append({"to": to, "subject": subject})
        return True


def _app():
    state = AppState(exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _client():
    return _app()[1]


def _auth(c, email="n@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "N"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_email_notify_consent_default_off_and_toggle():
    c = _client()
    h = _auth(c)
    assert c.get("/api/v1/users/me", headers=h).json()["notify_status_email"] is False
    on = c.put("/api/v1/users/me/email-notifications?enabled=true", headers=h).json()
    assert on["notify_status_email"] is True
    off = c.put("/api/v1/users/me/email-notifications?enabled=false", headers=h).json()
    assert off["notify_status_email"] is False


def test_status_change_emails_only_with_consent(monkeypatch):
    from jobsearch.models import JobPosting
    cap = _Capture()
    monkeypatch.setattr("jobsearch.api.routers.applications.build_email_sender", lambda s: cap)
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("n@x.com").id
    job = JobPosting(title="Platform Engineer", company="Acme", owner_id=uid)
    state.jobs.add(job)
    appid = c.post("/api/v1/applications", headers=h, json={"job_posting_id": job.id}).json()["id"]

    # consent OFF -> no email on a status change
    c.put(f"/api/v1/applications/{appid}/status", headers=h, json={"status": "submitted"})
    assert cap.sent == []

    # consent ON -> a status change emails the user
    c.put("/api/v1/users/me/email-notifications?enabled=true", headers=h)
    c.put(f"/api/v1/applications/{appid}/status", headers=h, json={"status": "interviewing"})
    assert len(cap.sent) == 1
    assert cap.sent[0]["to"] == "n@x.com"
    assert cap.sent[0]["subject"].startswith("Application update")
