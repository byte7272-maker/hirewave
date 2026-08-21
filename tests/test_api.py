"""API-level tests exercising the full authenticated pipeline over HTTP."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.engines.integration import MockTokenExchanger


@pytest.fixture
def client() -> TestClient:
    app = create_app(exchanger=MockTokenExchanger())
    return TestClient(app)


@pytest.fixture
def auth(client: TestClient) -> dict:
    client.post(
        "/api/v1/auth/register",
        json={"email": "sam@example.com", "password": "supersecret", "full_name": "Sam"},
    )
    tokens = client.post(
        "/api/v1/auth/login", json={"email": "sam@example.com", "password": "supersecret"}
    ).json()
    return {"Authorization": f"Bearer {tokens['access_token']}", "_refresh": tokens["refresh_token"]}


def _headers(auth: dict) -> dict:
    return {"Authorization": auth["Authorization"]}


MATCHING_JOB = {
    "source_platform": "linkedin",
    "title": "Senior Backend Engineer",
    "company": "Globex",
    "company_domain": "globex.com",
    "location": "Remote",
    "remote": True,
    "description": "Build Python microservices with FastAPI and PostgreSQL on AWS. Kubernetes, Docker, Redis. 6+ years.",
    "requirements": ["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
    "url": "https://linkedin.com/jobs/1",
}
SCAM_JOB = {
    "source_platform": "unknown_board",
    "title": "Work From Home Data Entry",
    "company": "QuickCash",
    "description": "URGENT! Apply now! Immediate start! No experience needed. Guaranteed income earn $5000 a week! Contact us on WhatsApp!",
    "url": "http://sketchy.example/2",
}


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_required(client: TestClient):
    assert client.get("/api/v1/users/me").status_code == 401  # no bearer


def test_register_conflict(client: TestClient):
    body = {"email": "a@b.com", "password": "password1"}
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert client.post("/api/v1/auth/register", json=body).status_code == 409


def test_refresh_flow(client: TestClient, auth: dict):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": auth["_refresh"]})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_profile_and_preferences(client: TestClient, auth: dict):
    h = _headers(auth)
    r = client.put(
        "/api/v1/users/me",
        headers=h,
        json={"headline": "Senior Backend Engineer", "skills": ["Python", "FastAPI", "AWS"]},
    )
    assert r.status_code == 200
    prof = client.get("/api/v1/users/me/profile", headers=h).json()
    assert prof["skills"] == ["Python", "FastAPI", "AWS"]

    client.put("/api/v1/users/me/preferences", headers=h, json={"remote_ok": True, "seniority": "senior"})
    prefs = client.get("/api/v1/users/me/preferences", headers=h).json()
    assert prefs["seniority"] == "senior"


def test_integration_connect_and_callback(client: TestClient, auth: dict):
    h = _headers(auth)
    r = client.post("/api/v1/integrations/connect/linkedin", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["authorization_url"].startswith("https://www.linkedin.com")

    cb = client.get(
        "/api/v1/integrations/callback/linkedin",
        params={"code": "abc", "state": data["state"]},
    )
    assert cb.status_code == 200
    conns = client.get("/api/v1/integrations", headers=h).json()
    assert any(c["provider"] == "linkedin" for c in conns)


def test_full_application_pipeline(client: TestClient, auth: dict):
    h = _headers(auth)
    client.put(
        "/api/v1/users/me",
        headers=h,
        json={
            "headline": "Senior Backend Engineer",
            "skills": ["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes", "Docker", "Redis"],
        },
    )

    # Ingest + verification.
    ing = client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [MATCHING_JOB, SCAM_JOB]})
    assert ing.status_code == 201 and ing.json()["ingested"] == 2

    # Scam hidden from the default job list.
    listed = client.get("/api/v1/jobs", headers=h).json()
    titles = {j["title"] for j in listed}
    assert "Senior Backend Engineer" in titles
    assert "Work From Home Data Entry" not in titles

    # Matching surfaces the good job.
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    assert matches[0]["title"] == "Senior Backend Engineer"
    job_id = matches[0]["job_id"]

    # Verification endpoint.
    v = client.get(f"/api/v1/jobs/{job_id}/verification", headers=h).json()
    assert v["authenticity_score"] >= 70

    # Generate documents.
    resume = client.post(
        "/api/v1/resumes/generate", headers=h, json={"job_posting_id": job_id}
    ).json()
    cover = client.post(
        "/api/v1/cover-letters/generate",
        headers=h,
        json={"job_posting_id": job_id, "resume_id": resume["id"]},
    ).json()

    # Create application.
    app = client.post(
        "/api/v1/applications",
        headers=h,
        json={"job_posting_id": job_id, "resume_id": resume["id"], "cover_letter_id": cover["id"]},
    ).json()

    # Submit before approval -> blocked by the human-in-the-loop gate.
    blocked = client.put(f"/api/v1/applications/{app['id']}/submit", headers=h, json={})
    assert blocked.status_code == 403

    # Approve both, then submit.
    client.put(f"/api/v1/resumes/{resume['id']}", headers=h, json={"approved": True})
    client.put(f"/api/v1/cover-letters/{cover['id']}", headers=h, json={"approved": True})
    submitted = client.put(f"/api/v1/applications/{app['id']}/submit", headers=h, json={})
    assert submitted.status_code == 200
    assert submitted.json()["success"] is True

    # Application now shows submitted.
    got = client.get(f"/api/v1/applications/{app['id']}", headers=h).json()
    assert got["status"] == "submitted"

    # A submission notification was created.
    notes = client.get("/api/v1/notifications", headers=h).json()
    assert any(n["type"] == "application_submitted" for n in notes)
