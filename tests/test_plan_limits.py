"""Free-tier plan limits + the Simple-experience plan snapshot."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _app(settings=None):
    s = settings or Settings(plan_limits_enforced=True)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="free@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _jobs(n):
    return [{
        "source_platform": "linkedin", "title": f"Backend Engineer {i}", "company": f"Co{i}",
        "company_domain": f"co{i}.com", "remote": True,
        "description": "Python FastAPI PostgreSQL microservices", "url": f"https://x/{i}",
    } for i in range(n)]


def test_free_plan_snapshot():
    _, c = _app()
    h = _auth(c)
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["plan"] == "free" and snap["unlimited"] is False
    assert snap["can_toggle_full"] is False and snap["simple_default"] is True
    assert snap["limits"]["resumes"] == 5 and snap["limits"]["matches_per_day"] == 10
    assert snap["limits"]["email_sources"] == 3
    assert snap["limits"]["autoapplies_per_day"] == 5 and snap["limits"]["autoapplies_per_week"] == 10
    # fresh account: full allowance (seeded samples don't count)
    assert snap["remaining"]["resumes"] == 5 and snap["remaining"]["reaped_month"] == 25


def test_tester_email_is_unlimited_and_can_toggle():
    _, c = _app(Settings(plan_limits_enforced=True, tester_emails_raw="vip@x.com, other@x.com"))
    h = _auth(c, email="vip@x.com")
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["plan"] == "tester" and snap["unlimited"] is True
    assert snap["can_toggle_full"] is True and snap["limits"] is None


def test_enforcement_flag_off_means_unlimited():
    _, c = _app(Settings(plan_limits_enforced=False))
    h = _auth(c)
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["unlimited"] is True and snap["can_toggle_full"] is True


def test_matches_capped_to_ten_for_free_but_not_testers():
    # free: 15 ingested, only 10 shown
    _, c = _app()
    h = _auth(c)
    assert c.post("/api/v1/jobs/ingest", headers=h, json={"jobs": _jobs(15)}).json()["ingested"] == 15
    assert len(c.get("/api/v1/jobs/matches", headers=h).json()) == 10

    # tester: all 15 shown
    _, c2 = _app(Settings(plan_limits_enforced=True, tester_emails_raw="vip@x.com"))
    h2 = _auth(c2, email="vip@x.com")
    assert c2.post("/api/v1/jobs/ingest", headers=h2, json={"jobs": _jobs(15)}).json()["ingested"] == 15
    assert len(c2.get("/api/v1/jobs/matches", headers=h2).json()) == 15


def test_reaping_capped_for_free():
    _, c = _app()
    h = _auth(c)
    # free cap is 25/month: a 30-job pull only stores 25
    assert c.post("/api/v1/jobs/ingest", headers=h, json={"jobs": _jobs(30)}).json()["ingested"] == 25
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["remaining"]["reaped_month"] == 0


def test_resume_cap_for_free():
    _, c = _app()
    h = _auth(c)
    for i in range(5):  # 5 real résumés allowed (the seeded sample doesn't count)
        r = c.post("/api/v1/resumes/upload", headers=h,
                   files={"file": (f"r{i}.txt", b"My resume text with Python and leadership.", "text/plain")})
        assert r.status_code == 201, r.text
    # the 6th is blocked with a friendly upgrade message
    r = c.post("/api/v1/resumes/upload", headers=h,
               files={"file": ("r6.txt", b"one more", "text/plain")})
    assert r.status_code == 402
    assert r.json()["detail"]["resource"] == "resumes"
