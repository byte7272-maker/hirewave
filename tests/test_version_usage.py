"""Version <-> job linkage: applications record which version was applied, and
version-usage exposes each version's tailored-for + applied-to jobs."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "u@x.com", "password": "supersecret", "full_name": "U"})
    tok = client.post("/api/v1/auth/login", json={"email": "u@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _job(client, h, title, company):
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [
        {"source_platform": "linkedin", "title": title, "company": company, "location": "NYC"}]})
    return next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == company)


def _resume(client, h):
    up = client.post("/api/v1/resumes/upload", headers=h,
                     files={"file": ("cv.md", b"# Me\n## Experience\n- Built things", "text/markdown")})
    return up.json()["id"]


def test_application_records_version_and_usage_links_jobs():
    client = _client()
    h = _auth(client)
    rid = _resume(client, h)
    job_a = _job(client, h, "Data Engineer", "Acme")
    job_b = _job(client, h, "Platform Engineer", "Globex")

    # Upload auto-creates an "Original" version 1; these two become versions 2 and 3,
    # each tailored for a different job.
    v_data = client.post(f"/api/v1/resumes/{rid}/versions", headers=h,
                         json={"content": "# Me v1 — data", "label": "Data", "job_posting_id": job_a}).json()
    v_plat = client.post(f"/api/v1/resumes/{rid}/versions", headers=h,
                         json={"content": "# Me v2 — platform", "label": "Platform", "job_posting_id": job_b}).json()
    vd, vp = v_data["active_version"], v_plat["active_version"]
    assert vd != vp

    # Apply: the Data version -> job_a (explicit), the now-active Platform version -> job_b.
    client.post("/api/v1/applications", headers=h, json={"job_id": job_a, "resume_id": rid, "resume_version": vd})
    client.post("/api/v1/applications", headers=h, json={"job_id": job_b, "resume_id": rid})  # uses active version

    usage = client.get(f"/api/v1/resumes/{rid}/version-usage", headers=h).json()
    by_v = {u["version"]: u for u in usage}

    # Each tailored version shows the job it was tailored for + applied to.
    assert by_v[vd]["tailored_for"]["company"] == "Acme"
    assert by_v[vp]["tailored_for"]["company"] == "Globex"
    assert [j["company"] for j in by_v[vd]["applied_to"]] == ["Acme"]
    assert [j["company"] for j in by_v[vp]["applied_to"]] == ["Globex"]


def test_application_out_exposes_the_version_used():
    client = _client()
    h = _auth(client)
    rid = _resume(client, h)
    job = _job(client, h, "SRE", "Initech")
    client.post(f"/api/v1/resumes/{rid}/versions", headers=h, json={"content": "# v1", "label": "v1"})
    app = client.post("/api/v1/applications", headers=h,
                      json={"job_id": job, "resume_id": rid, "resume_version": 1}).json()
    assert app["resume_version"] == 1
