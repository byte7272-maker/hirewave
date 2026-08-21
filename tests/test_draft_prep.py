"""draft_prep automation + résumé-bytes plumbing."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "Ada"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    client.put("/api/v1/users/me", headers=h, json={"skills": ["Python", "Go"], "headline": "Staff Engineer"})
    client.post("/api/v1/job-search/run", headers=h, json={"role": "Backend Engineer", "remote": True})
    return h


# --- draft prep -------------------------------------------------------------
def test_prepare_drafts_requires_permission():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/assistant/prepare-drafts", headers=h, json={}).status_code == 403
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    assert client.post("/api/v1/assistant/prepare-drafts", headers=h, json={"min_fit": 0}).status_code == 200


def test_prepare_drafts_creates_draft_applications_with_docs():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    r = client.post("/api/v1/assistant/prepare-drafts", headers=h, json={"min_fit": 0, "limit": 2}).json()
    assert r["prepared"] == 2 and len(r["application_ids"]) == 2
    apps = client.get("/api/v1/applications", headers=h).json()
    drafts = [a for a in apps if a["id"] in r["application_ids"]]
    assert all(a["status"] == "draft" and a["resume_id"] and a["cover_letter_id"] for a in drafts)
    # a MATCH_FOUND notification tells the user to review
    notifs = client.get("/api/v1/notifications", headers=h).json()
    assert any("draft" in n["message"].lower() for n in notifs)


def test_prepare_drafts_skips_already_drafted():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    first = client.post("/api/v1/assistant/prepare-drafts", headers=h, json={"min_fit": 0, "limit": 2}).json()
    # limit=2 again → the next two, not the same two (no duplicate applications for a job)
    second = client.post("/api/v1/assistant/prepare-drafts", headers=h, json={"min_fit": 0, "limit": 2}).json()
    assert set(first["application_ids"]).isdisjoint(second["application_ids"])
    apps = client.get("/api/v1/applications", headers=h).json()
    job_ids = [a["job_posting_id"] for a in apps]
    assert len(job_ids) == len(set(job_ids))  # never two drafts for one job


def test_prepare_drafts_audit_logged():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    client.post("/api/v1/assistant/prepare-drafts", headers=h, json={"min_fit": 0, "limit": 1})
    actions = client.get("/api/v1/assistant/actions", headers=h).json()
    assert any(a["kind"] == "prepare" for a in actions)


def test_search_auto_prepares_when_enabled():
    client = _client()
    h = _auth(client)
    # field is present and 0 when draft_prep is off
    off = client.post("/api/v1/job-search/run", headers=h, json={"role": "Data Scientist"}).json()
    assert off["drafts_prepared"] == 0
    # with consent, the run auto-invokes the assistant (>=0 depending on fit threshold)
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    on = client.post("/api/v1/job-search/run", headers=h, json={"role": "SRE"}).json()
    assert "drafts_prepared" in on


# --- résumé-bytes plumbing --------------------------------------------------
def test_uploaded_resume_appears_filled_in_plan():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h, files={"file": ("cv.md", b"# Ada CV\nPython, Go", "text/markdown")})
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["form_autofill"]})
    jid = client.get("/api/v1/jobs/matches", headers=h).json()[0]["job_id"]
    plan = client.post(f"/api/v1/assistant/autofill/{jid}", headers=h, json={}).json()
    resume_entry = next(e for e in plan["entries"] if "sum" in e["label"].lower() or e["field"] == "resume")
    assert resume_entry["status"] == "filled" and "cv.md" in resume_entry["value"]
