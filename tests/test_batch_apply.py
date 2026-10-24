"""Apply-wizard backend: add one or many jobs to the pipeline with chosen documents
and optionally start the automated apply — in a single call, idempotently."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@x.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _job(client, h, title, company) -> str:
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [
        {"source_platform": "linkedin", "title": title, "company": company, "location": "NYC",
         "url": f"https://www.linkedin.com/jobs/view/{company}"}]})
    return next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == company)


def _resume(client, h) -> str:
    up = client.post("/api/v1/resumes/upload", headers=h,
                     files={"file": ("cv.md", b"# Me\n## Experience\n- Built things", "text/markdown")})
    return up.json()["id"]


def test_batch_adds_jobs_to_pipeline_with_documents():
    client = _client()
    h = _auth(client)
    rid = _resume(client, h)
    a = _job(client, h, "Data Engineer", "Acme")
    b = _job(client, h, "Platform Engineer", "Globex")

    out = client.post("/api/v1/applications/batch", headers=h,
                      json={"job_ids": [a, b], "resume_id": rid}).json()
    assert out["created"] == 2 and len(out["results"]) == 2
    assert all(r["application_id"] and not r["error"] for r in out["results"])

    # The applications exist in the pipeline with the résumé attached.
    apps = client.get("/api/v1/applications", headers=h).json()
    assert len(apps) == 2 and all(ap["resume_id"] == rid for ap in apps)


def test_batch_is_idempotent_reuses_existing_draft():
    client = _client()
    h = _auth(client)
    rid = _resume(client, h)
    a = _job(client, h, "Data Engineer", "Acme")

    first = client.post("/api/v1/applications/batch", headers=h, json={"job_ids": [a], "resume_id": rid}).json()
    assert first["results"][0]["reused"] is False
    second = client.post("/api/v1/applications/batch", headers=h, json={"job_ids": [a], "resume_id": rid}).json()
    assert second["results"][0]["reused"] is True
    # Still only one draft for that job — no duplicate.
    assert len(client.get("/api/v1/applications", headers=h).json()) == 1


def test_batch_submit_runs_the_apply_and_reports_per_job():
    client = _client()
    h = _auth(client)
    rid = _resume(client, h)
    a = _job(client, h, "SRE", "Initech")
    out = client.post("/api/v1/applications/batch", headers=h,
                      json={"job_ids": [a], "resume_id": rid, "submit": True}).json()
    r = out["results"][0]
    # Either it submitted or it needs a manual finish — but it ran without error.
    assert r["application_id"] and (r["submitted"] or r["requires_manual"])
    assert out["created"] == 1


def test_batch_reports_unknown_job():
    client = _client()
    h = _auth(client)
    out = client.post("/api/v1/applications/batch", headers=h, json={"job_ids": ["nope"]}).json()
    assert out["failed"] == 1 and out["results"][0]["error"] == "job not found"
