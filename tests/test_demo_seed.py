"""New accounts are seeded with clearly-labelled sample data that is replaced the
moment the user adds real documents or ingests real jobs."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _reg(client, email="u@x.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_new_account_is_seeded_with_labelled_samples():
    client = _client()
    h = _reg(client)
    resumes = client.get("/api/v1/resumes", headers=h).json()
    assert len(resumes) == 1 and resumes[0]["is_sample"] is True
    cls = client.get("/api/v1/cover-letters", headers=h).json()
    assert len(cls) == 1 and cls[0]["is_sample"] is True
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    assert len(matches) >= 3 and all(m["is_sample"] for m in matches)
    assert all("Sample" in m["company"] for m in matches)  # clearly labelled


def test_real_resume_replaces_the_sample():
    client = _client()
    h = _reg(client)
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Real\n## Experience\n- did things", "text/markdown")})
    resumes = client.get("/api/v1/resumes", headers=h).json()
    assert len(resumes) == 1 and resumes[0]["is_sample"] is False


def test_real_cover_letter_replaces_the_sample():
    client = _client()
    h = _reg(client)
    client.post("/api/v1/cover-letters/upload", headers=h,
                files={"file": ("cl.md", b"Dear Team, I'm great. Sincerely, Me", "text/markdown")})
    cls = client.get("/api/v1/cover-letters", headers=h).json()
    assert len(cls) == 1 and cls[0]["is_sample"] is False


def test_real_job_ingest_clears_sample_matches():
    client = _client()
    h = _reg(client)
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [
        {"source_platform": "linkedin", "title": "Real Role", "company": "RealCo"}]})
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    assert not any(m["is_sample"] for m in matches)


def test_sample_jobs_are_scoped_to_their_owner():
    client = _client()
    ha = _reg(client, "a@x.com")
    hb = _reg(client, "b@x.com")
    # B never sees A's sample postings (sample jobs are owner-scoped).
    a_sample_ids = {m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=ha).json()}
    b_sample_ids = {m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=hb).json()}
    assert a_sample_ids.isdisjoint(b_sample_ids)


def test_delete_account_wipes_user_and_data():
    client = _client()
    h = _reg(client, "del@x.com")
    # seeded + a real upload
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Real", "text/markdown")})
    assert client.request("DELETE", "/api/v1/auth/me", headers=h, json={"password": "wrong"}).status_code == 403
    assert client.request("DELETE", "/api/v1/auth/me", headers=h, json={"password": "supersecret"}).status_code == 204
    # token no longer resolves to a user
    assert client.get("/api/v1/resumes", headers=h).status_code == 401
    # the email is free again
    assert client.post("/api/v1/auth/register",
                       json={"email": "del@x.com", "password": "supersecret", "full_name": "X"}).status_code == 201
