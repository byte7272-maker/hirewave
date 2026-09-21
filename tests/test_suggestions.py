"""Suggested job titles — remember searches + surface qualified-for roles."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.suggestions import SuggestionEngine
from jobsearch.models import JobPosting, Resume, UserProfile


# --- profile search memory --------------------------------------------------
def test_record_search_dedupes_and_caps():
    p = UserProfile(user_id="u1")
    p.record_search("IT Manager")
    p.record_search("IT Director")
    p.record_search("IT Manager")  # repeat → bumps count, moves to front
    assert [s.role for s in p.recent_searches] == ["IT Manager", "IT Director"]
    assert p.recent_searches[0].count == 2
    for i in range(30):
        p.record_search(f"Role {i}")
    assert len(p.recent_searches) == 25  # capped
    assert p.recent_searches[0].role == "Role 29"  # most recent first


# --- engine -----------------------------------------------------------------
def test_engine_leads_with_unknown_and_flags_known():
    prof = UserProfile(user_id="u1")
    prof.record_search("IT Operations Director")
    resume = Resume(
        user_id="u1", target_role="IT Director",
        rendered_text="IT Director. Skills: ITIL, VMware, Active Directory, service delivery, incident management.",
    )
    jobs = [
        JobPosting(id="j1", title="Service Delivery Manager", category="IT & Systems",
                   description="ITIL service delivery incident management", requirements=["ITIL", "service delivery"]),
        JobPosting(id="j2", title="IT Operations Director", category="IT & Systems", seniority="director",
                   description="VMware active directory"),
        JobPosting(id="j4", title="Data Analyst", category="Data & Analytics", description="SQL tableau"),
    ]
    res = SuggestionEngine().suggest(
        prof, resume=resume, jobs=jobs, known_titles={"IT Operations Director"}, limit=20, use_llm=False,
    )
    # inferred the user's space from the résumé
    assert "IT & Systems" in res.based_on["categories"]
    assert res.based_on["seniority"] == "director"
    titles = [s.title for s in res.suggestions]
    # a live-posting role they haven't searched is surfaced (grounded, with a sample)
    market = next(s for s in res.suggestions if s.title == "Service Delivery Manager")
    assert market.source == "market" and market.sample_job_id == "j1" and market.open_roles == 1
    assert not market.known
    # curated adjacent roles they may not know appear too
    assert any(s.source == "adjacent" for s in res.suggestions)
    # the one they've searched is flagged known and sorted after the new ones
    known = next(s for s in res.suggestions if s.title == "IT Operations Director")
    assert known.known is True
    assert titles.index("Service Delivery Manager") < titles.index("IT Operations Director")
    # a different-category role (Data Analyst) is not suggested for an IT profile
    assert "Data Analyst" not in titles


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "s@b.com", "password": "supersecret", "full_name": "S"})
    tok = client.post("/api/v1/auth/login", json={"email": "s@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_search_is_remembered_and_suggestions_returned():
    client = _client()
    h = _auth(client)
    # a search seeds the pool AND is remembered
    client.post("/api/v1/job-search/run", headers=h, json={"role": "IT Operations Manager", "remote": True})
    # ground on the user's own résumé
    client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"IT Director. Skills: ITIL, VMware, Active Directory, service delivery.", "text/plain")},
    )
    res = client.get("/api/v1/job-search/suggestions", headers=h).json()
    assert "IT Operations Manager" in res["recent_titles"]  # remembered
    assert res["suggestions"]  # non-empty
    assert all("title" in s and "reason" in s and "source" in s for s in res["suggestions"])
    # unknown roles lead the list
    assert res["suggestions"][0]["known"] is False


def test_api_suggestions_unknown_resume_404():
    client = _client()
    h = _auth(client)
    assert client.get("/api/v1/job-search/suggestions?resume_id=res_nope", headers=h).status_code == 404


def test_api_suggestions_requires_auth():
    assert _client().get("/api/v1/job-search/suggestions").status_code == 401
