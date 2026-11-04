"""Account tiers (tester / trial / free): the plan snapshot + enforcement.

Core rule under test: editing a résumé and running a basic AI edit are never blocked;
tiers only meter the cost / volume drivers, with liberal caps on the trial.
"""

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


def _free_app():
    # trial_days=0 → a brand-new account is on the free baseline immediately.
    return _app(Settings(plan_limits_enforced=True, trial_days=0))


def _auth(c, email="person@example.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _jobs(n):
    return [{
        "source_platform": "linkedin", "title": f"Backend Engineer {i}", "company": f"Co{i}",
        "company_domain": f"co{i}.com", "remote": True,
        "description": "Python FastAPI PostgreSQL microservices", "url": f"https://x/{i}",
    } for i in range(n)]


def test_new_account_starts_on_the_trial():
    # Default trial_days=30: a brand-new login gets the full-for-now trial.
    _, c = _app()
    h = _auth(c)
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["plan"] == "trial" and snap["tier"] == "trial"
    assert snap["unlimited"] is False and snap["can_toggle_full"] is True
    assert snap["simple_default"] is False            # trial opens in the full view
    assert 28 <= snap["trial"]["days_left"] <= 30
    # liberal trial caps
    assert snap["limits"]["resumes"] == 20 and snap["limits"]["ai_edits_per_day"] == 100


def test_free_baseline_snapshot():
    _, c = _free_app()
    h = _auth(c)
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["plan"] == "free" and snap["unlimited"] is False
    # nobody is locked out of the full app; free just defaults to Simple
    assert snap["can_toggle_full"] is True and snap["simple_default"] is True
    assert snap["limits"]["resumes"] == 5 and snap["limits"]["matches_per_day"] == 20
    assert snap["limits"]["resume_words"] == 1500
    assert snap["remaining"]["resumes"] == 5 and snap["remaining"]["reaped_month"] == 50


def test_tester_email_override_is_unlimited_and_full():
    _, c = _app(Settings(plan_limits_enforced=True, tester_emails_raw="vip@x.com, other@x.com"))
    h = _auth(c, email="vip@x.com")
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["plan"] == "tester" and snap["unlimited"] is True
    assert snap["can_toggle_full"] is True and snap["limits"] is None


def test_gmail_is_no_longer_an_automatic_tester():
    # The gmail auto-tester default is gone; gmail is just a normal new (trial) account.
    _, c = _app()
    h = _auth(c, email="someone@gmail.com")
    assert c.get("/api/v1/auth/me/plan", headers=h).json()["plan"] == "trial"


def test_enforcement_flag_off_means_unlimited():
    _, c = _app(Settings(plan_limits_enforced=False))
    h = _auth(c)
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["unlimited"] is True and snap["can_toggle_full"] is True


def test_matches_capped_for_free_but_not_testers():
    # free: 25 ingested (under the 50 reap cap), only 20 shown
    _, c = _free_app()
    h = _auth(c)
    assert c.post("/api/v1/jobs/ingest", headers=h, json={"jobs": _jobs(25)}).json()["ingested"] == 25
    assert len(c.get("/api/v1/jobs/matches", headers=h).json()) == 20

    # tester: all 25 shown
    _, c2 = _app(Settings(plan_limits_enforced=True, trial_days=0, tester_emails_raw="vip@x.com"))
    h2 = _auth(c2, email="vip@x.com")
    assert c2.post("/api/v1/jobs/ingest", headers=h2, json={"jobs": _jobs(25)}).json()["ingested"] == 25
    assert len(c2.get("/api/v1/jobs/matches", headers=h2).json()) == 25


def test_reaping_capped_for_free():
    _, c = _free_app()
    h = _auth(c)
    # free reap cap is 50/month: a 60-job pull only stores 50
    assert c.post("/api/v1/jobs/ingest", headers=h, json={"jobs": _jobs(60)}).json()["ingested"] == 50
    snap = c.get("/api/v1/auth/me/plan", headers=h).json()
    assert snap["remaining"]["reaped_month"] == 0


def test_ai_edit_rate_capped_for_free(monkeypatch):
    import jobsearch.engines.plans as plans_mod
    monkeypatch.setitem(plans_mod.TIER_LIMITS[plans_mod.FREE], "ai_edits_per_day", 2)
    _, c = _free_app()
    h = _auth(c)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("r.txt", b"Python engineer. Led teams and improved delivery.", "text/plain")}).json()["id"]
    for _ in range(2):
        r = c.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={"instruction": "make it more concise"})
        assert r.status_code == 200, r.text
    r = c.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={"instruction": "shorten it"})
    assert r.status_code == 402 and r.json()["detail"]["resource"] == "ai_edits"


def test_large_ai_input_is_never_blocked():
    # No account is throttled out of basic AI editing by input size.
    _, c = _free_app()
    h = _auth(c)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("r.txt", b"Python engineer.", "text/plain")}).json()["id"]
    r = c.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h,
               json={"instruction": "tighten", "content": "x" * 13000})
    assert r.status_code == 200, r.text


def test_resume_cap_for_free():
    _, c = _free_app()
    h = _auth(c)
    for i in range(5):  # 5 real résumés allowed (the seeded sample doesn't count)
        r = c.post("/api/v1/resumes/upload", headers=h,
                   files={"file": (f"r{i}.txt", b"My resume text with Python and leadership.", "text/plain")})
        assert r.status_code == 201, r.text
    # the 6th is blocked with a friendly (non-upgrade) message
    r = c.post("/api/v1/resumes/upload", headers=h,
               files={"file": ("r6.txt", b"one more", "text/plain")})
    assert r.status_code == 402
    assert r.json()["detail"]["resource"] == "resumes"
    assert "upgrade" not in r.json()["detail"]["message"].lower()
