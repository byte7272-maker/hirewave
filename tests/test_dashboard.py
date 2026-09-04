"""Dashboard summary — real aggregated counts (never placeholder data)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="dash@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "D"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_fresh_account_is_all_zeros():
    client = _client()
    h = _auth(client)
    d = client.get("/api/v1/dashboard/summary", headers=h).json()
    assert d["matches"]["total"] == 0 and d["matches"]["top"] is None
    assert d["applications"]["total"] == 0
    assert d["interviews"] == 0 and d["resumes"] == 0 and d["highlights"] == 0
    assert d["connected_apps"]["count"] == 0
    assert d["profile_complete"] is False
    assert d["recent_activity"] == []


def test_counts_reflect_real_activity():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/users/me/profile", headers=h, json={"skills": ["Python", "FastAPI"]})
    # a résumé + a highlight + a mock interview + a search (→ matches) + a connected site
    client.post("/api/v1/resumes/upload", headers=h, files={"file": ("cv.md", b"# CV\nPython", "text/markdown")})
    client.post("/api/v1/experience", headers=h, json={"content": "Led the billing migration, cutting latency 40%."})
    client.post("/api/v1/interview/mock/start", headers=h, json={"difficulty": "easy", "max_questions": 2})
    client.post("/api/v1/job-search/run", headers=h, json={"role": "python engineer", "location": "NYC", "remote": True})
    client.post("/api/v1/auto-apply/sessions", headers=h,
                json={"provider": "linkedin", "storage_state": "{\"cookies\":[]}", "label": "me@x"})

    d = client.get("/api/v1/dashboard/summary", headers=h).json()
    assert d["resumes"] == 1
    assert d["highlights"] == 1
    assert d["interviews"] == 1
    assert d["matches"]["total"] >= 1 and d["matches"]["top"] is not None
    assert d["connected_apps"]["count"] == 1 and "linkedin" in d["connected_apps"]["providers"]
    assert d["profile_complete"] is True


def test_applications_by_status():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/job-search/run", headers=h, json={"role": "dev", "location": "NYC", "remote": True})
    job_id = client.get("/api/v1/jobs", headers=h).json()[0]["id"]
    client.post("/api/v1/applications", headers=h, json={"job_posting_id": job_id})
    d = client.get("/api/v1/dashboard/summary", headers=h).json()
    assert d["applications"]["total"] == 1
    assert sum(d["applications"]["by_status"].values()) == 1


def test_requires_auth():
    assert _client().get("/api/v1/dashboard/summary").status_code == 401
