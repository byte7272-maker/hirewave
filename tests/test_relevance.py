"""Job relevance to user preferences: scoring, the filter gate, preference inference from
reaped jobs, and the dashboard needs_preferences + suggested-preferences endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing import relevance
from jobsearch.models import JobPosting
from jobsearch.models.user import JobPreferences


def _job(title, category=""):
    return JobPosting(source_platform="x", title=title, company="C", location="NY", category=category)


# --- pure relevance ---------------------------------------------------------
def test_no_prefs_means_everything_relevant():
    prefs = JobPreferences()
    assert relevance.is_relevant(_job("Marketing Manager"), prefs)
    assert relevance.relevance_score(_job("Marketing Manager"), prefs) == 1.0


def test_filters_off_target_jobs_when_prefs_set():
    prefs = JobPreferences(target_roles=["IT Director", "Software Engineer"],
                           job_categories=["Information Technology"])
    it_job = _job("Senior IT Director")
    sw_job = _job("Software Engineer II", category="Information Technology")
    mkt = _job("Marketing Manager")
    assert relevance.is_relevant(it_job, prefs) and relevance.is_relevant(sw_job, prefs)
    assert not relevance.is_relevant(mkt, prefs)
    kept = relevance.filter_relevant([it_job, sw_job, mkt], prefs)
    assert mkt not in kept and it_job in kept and sw_job in kept


def test_filter_never_empties_when_jobs_exist():
    prefs = JobPreferences(target_roles=["Astronaut"])
    jobs = [_job("Marketing Manager"), _job("Sales Rep")]
    # gate would remove all -> fall back to the full list rather than show nothing
    assert relevance.filter_relevant(jobs, prefs) == jobs


def test_infer_preferences_from_reaped_jobs():
    jobs = [_job("IT Director", "IT"), _job("IT Support Specialist", "IT"),
            _job("Network Engineer", "IT"), _job("Marketing Manager", "Marketing")]
    out = relevance.infer_preferences(jobs, top=3)
    assert "IT" in out["job_categories"]
    assert any("it" in r.lower() or "network" in r.lower() for r in out["target_roles"])
    assert "director" in out["keywords"] or "engineer" in out["keywords"]


# --- endpoints --------------------------------------------------------------
def _app():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="p@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "P"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_dashboard_needs_preferences_flag():
    st, c = _app()
    h = _auth(c)
    body = c.get("/api/v1/dashboard/summary", headers=h).json()
    assert body["needs_preferences"] is True  # nothing set yet
    c.put("/api/v1/users/me/preferences", headers=h, json={"target_roles": ["IT Director"]})
    body2 = c.get("/api/v1/dashboard/summary", headers=h).json()
    assert body2["needs_preferences"] is False


def test_suggested_preferences_from_pool():
    st, c = _app()
    h = _auth(c)
    uid = st.user_by_email("p@x.com").id
    for t, cat in [("IT Director", "IT"), ("Network Engineer", "IT"), ("Marketing Lead", "Marketing")]:
        st.jobs.add(JobPosting(source_platform="x", title=t, company="C", location="NY",
                               category=cat, owner_id=uid))
    r = c.get("/api/v1/users/me/preferences/suggested", headers=h).json()
    assert r["has_preferences"] is False and r["sampled_jobs"] == 3
    assert "IT" in r["suggested"]["job_categories"]
