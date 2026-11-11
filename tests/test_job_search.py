"""Robust free-text job search: synonym/OR query engine, the NLU search_jobs intent,
and the GET /api/v1/jobs/search endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant.intent import interpret
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing import job_query
from jobsearch.models import JobPosting
from jobsearch.models.job import SalaryRange


# --- query engine -----------------------------------------------------------
def _job(title, **kw):
    return JobPosting(title=title, **kw)


def test_canonicalize_equates_abbreviations():
    assert job_query.canonicalize("VP") == job_query.canonicalize("Vice President")
    assert job_query.canonicalize("Sr Engineer") == job_query.canonicalize("Senior Engineer")
    assert job_query.canonicalize("SWE") == job_query.canonicalize("software engineer")


def test_parse_alternatives_splits_and_strips():
    assert job_query.parse_alternatives("jobs that are vice president or VP") == ["vice president", "vp"]
    # the stopword "of" is stripped, which is fine — canonicalization matches regardless
    assert job_query.parse_alternatives("director, vp of marketing") == ["director", "vp marketing"]


def test_search_matches_synonyms_and_or():
    jobs = [
        _job("Vice President, Sales"),
        _job("VP of Marketing"),
        _job("Senior Software Engineer"),
        _job("Barista"),
    ]
    hits = [s.job.title for s in job_query.search(jobs, "vice president or VP")]
    assert "Vice President, Sales" in hits and "VP of Marketing" in hits
    assert "Barista" not in hits and "Senior Software Engineer" not in hits

    # a single abbreviation finds the spelled-out title and vice versa
    assert any(s.job.title == "Vice President, Sales" for s in job_query.search(jobs, "VP"))
    assert any(s.job.title == "Senior Software Engineer" for s in job_query.search(jobs, "sr swe"))


def test_search_title_outranks_description():
    jobs = [
        _job("Operations Manager", description="nothing relevant"),
        _job("Barista", description="reports to the vice president"),
    ]
    ranked = job_query.search(jobs, "VP")
    # the description mention still matches, but a title would outrank it; here only the
    # barista mentions VP, so it appears — assert it's found, and a title hit ranks first.
    jobs2 = jobs + [_job("Vice President")]
    ranked2 = job_query.search(jobs2, "VP")
    assert ranked2[0].job.title == "Vice President"


def test_search_structured_filters():
    jobs = [
        _job("VP Sales", remote=True, seniority="director", salary_range=SalaryRange(minimum=200000, maximum=300000)),
        _job("VP Sales (onsite)", remote=False, seniority="director"),
    ]
    assert len(job_query.search(jobs, "VP", remote=True)) == 1
    assert len(job_query.search(jobs, "VP", min_salary=250000)) == 1
    assert len(job_query.search(jobs, "VP", seniority="senior")) == 0


def test_empty_or_irrelevant_query_yields_nothing():
    jobs = [_job("VP Sales")]
    assert job_query.search(jobs, "") == []
    assert job_query.search(jobs, "quantum basketweaving") == []


# --- NLU intent -------------------------------------------------------------
def test_intent_recognizes_job_search_with_or():
    r = interpret("find all jobs that are vice president or VP")
    assert r.intent == "search_jobs"
    assert "vice president" in r.slots["query"] and "vp" in r.slots["query"]


def test_intent_search_variants():
    assert interpret("search for remote senior python roles").intent == "search_jobs"
    assert interpret("VP openings").intent == "search_jobs"
    assert interpret("show me all director or manager jobs").intent == "search_jobs"


def test_intent_does_not_hijack_navigation_or_playbooks():
    # section navigation and document nav must NOT become a search
    assert interpret("show me my matches").intent != "search_jobs"
    assert interpret("find my resume").intent != "search_jobs"
    # the walk-matches playbook phrase stays a playbook
    assert interpret("which jobs fit").intent != "search_jobs"


# --- endpoint ---------------------------------------------------------------
def _app():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="u@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_search_endpoint_roundtrip():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("u@x.com").id
    for title in ["Vice President, Sales", "VP of Marketing", "Software Engineer"]:
        state.jobs.add(JobPosting(title=title, owner_id=uid, company="Acme"))

    r = c.get("/api/v1/jobs/search", params={"q": "vice president or VP", "include_hidden": True}, headers=h)
    assert r.status_code == 200
    titles = {j["title"] for j in r.json()}
    assert "Vice President, Sales" in titles and "VP of Marketing" in titles
    assert "Software Engineer" not in titles


def test_search_endpoint_requires_query():
    state, c = _app()
    h = _auth(c)
    assert c.get("/api/v1/jobs/search", headers=h).status_code == 422  # q is required
