"""Gather profile data from LinkedIn — provider, mapping, export parse, API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import (
    MockLinkedInProfileProvider,
    MockTokenExchanger,
    build_linkedin_provider,
    map_claims_to_profile,
    parse_export_text,
)
from jobsearch.engines.integration.linkedin_profile import HttpLinkedInProfileProvider

EXPORT = """About
Senior backend engineer with a decade building payments platforms.

Experience
Staff Engineer at Stripe
2020 - Present
Led the ledger rewrite serving billions of events.

Backend Engineer, Square
2016 - 2020
Owned the payouts service.

Skills
Python, Go, Distributed Systems, PostgreSQL, Kubernetes

Education
MIT
BSc Computer Science 2016
"""


# --- provider selection + mapping ------------------------------------------
def test_build_provider_defaults_to_mock():
    assert isinstance(build_linkedin_provider(Settings(linkedin_profile_provider="mock")), MockLinkedInProfileProvider)


def test_build_provider_http_when_configured():
    p = build_linkedin_provider(Settings(linkedin_profile_provider="http", linkedin_profile_url="https://x/y"))
    assert isinstance(p, HttpLinkedInProfileProvider)


def test_map_claims_to_profile():
    prof = map_claims_to_profile("u1", MockLinkedInProfileProvider().fetch(""))
    assert prof.headline and prof.skills
    assert prof.work_experience[0].company == "Figma"
    assert prof.education[0].institution.startswith("Rhode Island")


def test_parse_export_text_extracts_sections():
    prof = parse_export_text("u1", EXPORT)
    assert prof.summary.startswith("Senior backend engineer")
    assert "Python" in prof.skills and "Kubernetes" in prof.skills
    titles = {(e.title, e.company) for e in prof.work_experience}
    assert ("Staff Engineer", "Stripe") in titles
    assert ("Backend Engineer", "Square") in titles
    exp = {e.company: (e.start, e.end) for e in prof.work_experience}
    assert exp["Stripe"] == ("2020", "present")
    assert prof.education[0].graduation_year == 2016


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_import_returns_draft_without_saving():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/integrations/linkedin/import", headers=h, json={"apply": False})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "mock" and body["applied"] is False
    assert body["profile"]["headline"]
    # nothing persisted yet
    assert client.get("/api/v1/users/me/profile", headers=h).json()["headline"] == ""


def test_api_import_apply_merges_and_preserves_preferences():
    client = _client()
    h = _auth(client)
    # user already set a preference we must not clobber
    client.put("/api/v1/users/me/preferences", headers=h, json={"seniority": "staff"})
    r = client.post("/api/v1/integrations/linkedin/import", headers=h, json={"apply": True})
    assert r.status_code == 200 and r.json()["applied"] is True
    prof = client.get("/api/v1/users/me/profile", headers=h).json()
    assert prof["headline"] == "Senior Product Designer"
    assert "Figma" in prof["skills"]
    assert prof["preferences"]["seniority"] == "staff"  # preserved


def test_api_import_file_parses_export():
    client = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/integrations/linkedin/import-file",
        headers=h,
        files={"file": ("linkedin.txt", EXPORT.encode(), "text/plain")},
        data={"apply": "true"},
    )
    assert r.status_code == 200
    prof = r.json()["profile"]
    assert r.json()["source"] == "export"
    assert "Python" in prof["skills"]
    assert any(e["company"] == "Stripe" for e in prof["work_experience"])


def test_api_apply_reviewed_subset_only():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/users/me/preferences", headers=h, json={"seniority": "senior"})
    # user kept only 2 skills + 1 role, and omitted education entirely
    r = client.post("/api/v1/integrations/linkedin/apply", headers=h, json={
        "headline": "Staff Designer",
        "skills": ["Figma", "Accessibility"],
        "work_experience": [{"company": "Figma", "title": "Senior Product Designer"}],
    })
    assert r.status_code == 200 and r.json()["source"] == "review"
    prof = client.get("/api/v1/users/me/profile", headers=h).json()
    assert prof["headline"] == "Staff Designer"
    assert prof["skills"] == ["Figma", "Accessibility"]
    assert len(prof["work_experience"]) == 1
    assert prof["education"] == []  # omitted → untouched (was empty)
    assert prof["preferences"]["seniority"] == "senior"  # preserved


def test_api_import_requires_auth():
    client = _client()
    assert client.post("/api/v1/integrations/linkedin/import", json={"apply": False}).status_code == 401
