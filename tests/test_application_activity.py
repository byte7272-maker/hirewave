"""Per-application activity log: the AI's apply steps + which documents it used."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import JobPosting


def _app():
    state = AppState(exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c):
    c.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = c.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_activity_logs_steps_and_documents_used():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("a@b.com").id
    job = JobPosting(title="SRE", company="Acme", owner_id=uid)
    state.jobs.add(job)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("my_resume.txt", b"Python SRE experience", "text/plain")}).json()["id"]
    app = c.post("/api/v1/applications", headers=h,
                 json={"job_posting_id": job.id, "resume_id": rid}).json()

    act = c.get(f"/api/v1/applications/{app['id']}/activity", headers=h).json()
    # a link to check the outcome on the provider site is present
    assert "source_url" in act["job"]
    # which document was used
    assert act["resume"]["name"] == "my_resume.txt" and act["resume"]["version"] == 1
    assert act["cover_letter"] is None
    # the AI's steps, in plain English
    assert any(s["label"] == "Prepared your application" for s in act["steps"])

    # a status change adds a readable step
    c.put(f"/api/v1/applications/{app['id']}/status", headers=h, json={"status": "interviewing"})
    act2 = c.get(f"/api/v1/applications/{app['id']}/activity", headers=h).json()
    assert any("interviewing" in s["label"].lower() for s in act2["steps"])


def test_activity_requires_ownership():
    _, c = _app()
    h = _auth(c)
    assert c.get("/api/v1/applications/nope/activity", headers=h).status_code == 404
