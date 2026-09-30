"""Standing auto-apply — connected sessions (encrypted), grant matching + limits,
and the bounded batch runner. Covers the engine and the API surface."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import AutoApplyCriteria, JobPosting, User, UserProfile
from jobsearch.models.common import utcnow


def _state(**settings) -> AppState:
    return AppState(settings=Settings(**settings), exchanger=MockTokenExchanger())


def _seed_user(state: AppState, uid="u1") -> User:
    return state.users.add(User(id=uid, email=f"{uid}@x.com", full_name="Ada Lovelace", phone="555-0100"))


def _job(state, jid, title, company="Acme", *, platform="indeed", verified=True, score=80.0, remote=True, location="Remote"):
    return state.jobs.add(JobPosting(
        id=jid, title=title, company=company, location=location, remote=remote,
        source_platform=platform, url=f"https://jobs/{jid}", is_verified=verified, match_score=score,
    ))


# ---- session store (encryption) -------------------------------------------
def test_connected_session_is_encrypted_at_rest():
    state = _state()
    _seed_user(state)
    plaintext = '{"cookies":[{"name":"li_at","value":"secret-cookie"}]}'
    state.auto_apply.connect_session("u1", "linkedin", plaintext, label="ada@x.com")
    rec = state.sessions.get_record("u1", "linkedin")
    assert "secret-cookie" not in rec.storage_state  # stored ciphertext, not plaintext
    assert state.sessions.reveal("u1", "linkedin") == plaintext  # decrypts back
    assert state.auto_apply.disconnect_session("u1", "linkedin") is True
    assert state.sessions.reveal("u1", "linkedin") is None


# ---- matching + verified-only ---------------------------------------------
def test_eligible_respects_criteria_and_verified():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Senior Python Engineer", score=90)
    _job(state, "j2", "Python Developer", company="Beta", score=70)
    _job(state, "j3", "Python Dev", company="Scam Co", verified=False, score=99)  # excluded (unverified)
    _job(state, "j4", "Java Engineer", score=88)  # excluded (title)
    # Legacy fallback path: with no matching engine wired, the min_fit_score gate
    # uses the posting's own score (owner scoring is exercised separately below).
    state.auto_apply.matching = None
    grant = state.auto_apply.create_grant(
        "u1", scope="criteria",
        criteria=AutoApplyCriteria(title_keywords=["python"], min_fit_score=60),
        require_verified=True,
    )
    titles = [j.id for j in state.auto_apply.eligible_jobs(grant)]
    assert titles == ["j1", "j2"]  # sorted by score desc, verified only, python only


class _StubMatch:
    """Deterministic matching stub: returns a fit score chosen per user, so we can
    prove the gate uses the GRANT OWNER's score, not the shared job.match_score."""

    def __init__(self, by_user: dict) -> None:
        self.by_user = by_user

    def score(self, profile, job):
        from types import SimpleNamespace
        return SimpleNamespace(score=self.by_user.get(profile.user_id, 0.0))


def test_min_fit_score_uses_grant_owner_score_not_shared_field():
    state = _state()
    _seed_user(state, "u1")
    _seed_user(state, "u2")
    # Non-empty profiles so the owner's fit is computed (not skipped).
    state.profiles.add(UserProfile(user_id="u1", skills=["python"]))
    state.profiles.add(UserProfile(user_id="u2", skills=["python"]))
    # One shared job with a HIGH shared match_score (as if user1 ranked it).
    _job(state, "j1", "Python Engineer", score=99)
    # Owner fits: u1 fits well, u2 does not — regardless of the shared 99.
    state.auto_apply.matching = _StubMatch({"u1": 90.0, "u2": 10.0})

    g1 = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"], min_fit_score=50))
    g2 = state.auto_apply.create_grant("u2", criteria=AutoApplyCriteria(title_keywords=["python"], min_fit_score=50))
    assert [j.id for j in state.auto_apply.eligible_jobs(g1)] == ["j1"]  # owner fit 90 >= 50
    assert state.auto_apply.eligible_jobs(g2) == []  # owner fit 10 < 50 despite shared 99


def test_scope_jobs_targets_exact_ids():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Anything A")
    _job(state, "j2", "Anything B")
    grant = state.auto_apply.create_grant("u1", scope="jobs", job_ids=["j2"])
    assert [j.id for j in state.auto_apply.eligible_jobs(grant)] == ["j2"]


# ---- runner: dry-run, submit, dedup, caps ---------------------------------
def test_dry_run_changes_nothing():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Python Engineer")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    res = state.auto_apply.run_grant(grant, dry_run=True)
    assert res.submitted == 0 and res.eligible == 1
    assert [o.status for o in res.outcomes] == ["would_submit"]
    assert grant.submits_used == 0
    assert state.applications.find(user_id="u1") == []


def test_run_submits_and_dedupes_and_records_application():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Python Engineer", score=90)
    _job(state, "j2", "Python Developer", score=70)
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), max_submits=5, daily_cap=5)
    res = state.auto_apply.run_grant(grant)  # mock driver → "submitted"
    assert res.submitted == 2
    assert grant.submits_used == 2 and grant.submitted_today == 2
    apps = {a.job_posting_id for a in state.applications.find(user_id="u1")}
    assert apps == {"j1", "j2"}
    # re-run: both already applied → nothing eligible
    res2 = state.auto_apply.run_grant(grant)
    assert res2.eligible == 0 and res2.submitted == 0


def test_daily_cap_bounds_a_single_run():
    state = _state()
    _seed_user(state)
    for i in range(5):
        _job(state, f"j{i}", "Python Engineer", score=90 - i)
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), max_submits=10, daily_cap=2)
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 2  # capped by daily_cap
    assert grant.submitted_today == 2


def test_max_submits_exhausts_grant():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Python Engineer", score=90)
    _job(state, "j2", "Python Developer", score=80)
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), max_submits=1, daily_cap=5)
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 1
    assert grant.status == "exhausted"


def test_paused_grant_does_not_run():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Python Engineer")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply.set_status(grant.id, "u1", "paused")
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 0 and "paused" in res.detail


def test_expired_grant_is_marked_and_skipped():
    state = _state()
    _seed_user(state)
    _job(state, "j1", "Python Engineer")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    grant.expires_at = utcnow() - timedelta(hours=1)
    res = state.auto_apply.run_grant(grant)
    assert grant.status == "expired"
    assert res.submitted == 0


# ---- honest simulation (mock mode is not a real submission) ----------------
def test_mock_run_is_labeled_simulated():
    state = _state()  # default: assistant_browser=mock -> offline/simulated
    _seed_user(state)
    _job(state, "j1", "Python Engineer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 1 and res.simulated is True
    assert "simulated" in res.detail.lower()
    app = state.applications.find(user_id="u1")[0]
    assert app.platform_response.get("simulated") is True  # not a real submission
    assert "simulated" in res.outcomes[0].detail.lower()


def test_live_run_queues_for_approval_and_never_submits():
    """HARD RULE: an autonomous run never submits a real application, even with a
    live session AND the submit gate on. It only queues for the user's approval."""
    from jobsearch.engines.assistant.live_fill import MockBrowserDriver
    from jobsearch.models import ApplicationStatus

    state = _state(auto_apply_live_submit=True)  # gate ON — still must not auto-submit
    _seed_user(state)
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    # Simulate a LIVE driver (a connected session).
    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (MockBrowserDriver(), True)
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 0
    assert res.outcomes[0].status == "pending_approval"
    apps = state.applications.find(user_id="u1")
    assert len(apps) == 1 and apps[0].status == ApplicationStatus.PENDING_APPROVAL
    assert apps[0].submitted_at is None  # nothing was sent
    assert "approve" in res.detail.lower()


def test_approve_application_is_the_only_real_submit_path():
    from jobsearch.engines.assistant.live_fill import MockBrowserDriver
    from jobsearch.models import ApplicationStatus

    state = _state(auto_apply_live_submit=True)
    _seed_user(state)
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (MockBrowserDriver(), True)
    state.auto_apply.run_grant(grant)

    pending = state.auto_apply.pending_approvals("u1")
    assert len(pending) == 1
    # The user approves this one application -> it now submits.
    out = state.auto_apply.approve_application("u1", pending[0].id)
    assert out["status"] == "submitted"
    app = state.applications.get(pending[0].id)
    assert app.status == ApplicationStatus.SUBMITTED and app.submitted_at is not None
    assert not state.auto_apply.pending_approvals("u1")  # cleared


def test_reject_application_never_submits():
    from jobsearch.engines.assistant.live_fill import MockBrowserDriver
    from jobsearch.models import ApplicationStatus

    state = _state(auto_apply_live_submit=True)
    _seed_user(state)
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (MockBrowserDriver(), True)
    state.auto_apply.run_grant(grant)

    pending = state.auto_apply.pending_approvals("u1")
    assert state.auto_apply.reject_application("u1", pending[0].id) is not None
    app = state.applications.get(pending[0].id)
    assert app.status == ApplicationStatus.REJECTED and app.submitted_at is None
    assert not state.auto_apply.pending_approvals("u1")


def test_approve_reject_are_owner_scoped():
    from jobsearch.engines.assistant.live_fill import MockBrowserDriver

    state = _state(auto_apply_live_submit=True)
    _seed_user(state, "u1")
    _seed_user(state, "u2")
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (MockBrowserDriver(), True)
    state.auto_apply.run_grant(grant)
    aid = state.auto_apply.pending_approvals("u1")[0].id
    # A different user can neither approve nor reject someone else's application.
    assert state.auto_apply.approve_application("u2", aid) is None
    assert state.auto_apply.reject_application("u2", aid) is None


# ---- concurrency: no double-submit ----------------------------------------
def test_pre_submit_dedup_backstop_skips_already_applied():
    from jobsearch.models import Application, ApplicationStatus

    state = _state()
    _seed_user(state)
    j = _job(state, "in1", "Python Developer", platform="indeed")
    # Simulate a cross-process run having already applied to this job...
    state.applications.add(Application(user_id="u1", job_posting_id="in1", status=ApplicationStatus.SUBMITTED))
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    # ...but force it to appear eligible (as if the race hadn't been seen yet).
    state.auto_apply.eligible_jobs = lambda g: [j]
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 0
    assert res.outcomes[0].status == "skipped" and "deduped" in res.outcomes[0].detail.lower()
    assert len(state.applications.find(user_id="u1")) == 1  # no duplicate created


def test_concurrent_runs_of_a_grant_do_not_double_submit():
    import threading
    import time

    from jobsearch.engines.assistant.live_fill import MockBrowserDriver

    state = _state()
    _seed_user(state)
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant(
        "u1", criteria=AutoApplyCriteria(title_keywords=["python"]), max_submits=5, daily_cap=5)

    class _SlowDriver(MockBrowserDriver):
        def finalize(self) -> str:
            time.sleep(0.1)  # widen the race window so overlap is real
            return "mock-submitted"

    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (_SlowDriver(), False)
    results: list = []
    threads = [threading.Thread(target=lambda: results.append(state.auto_apply.run_grant(grant))) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    # Exactly one application for the single job, despite two overlapping runs.
    assert [a.job_posting_id for a in state.applications.find(user_id="u1")] == ["in1"]
    assert sum(r.submitted for r in results) == 1


# ---- API ------------------------------------------------------------------
def _client_and_token():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()["access_token"]
    return client, {"Authorization": f"Bearer {tok}"}


def test_api_requires_auth():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.get("/api/v1/auto-apply/grants").status_code == 401
    assert client.get("/api/v1/auto-apply/sessions").status_code == 401


def test_api_connect_session_never_returns_secret():
    client, h = _client_and_token()
    body = {"provider": "LinkedIn", "storage_state": '{"cookies":[{"value":"top-secret"}]}', "label": "me@x.com"}
    r = client.post("/api/v1/auto-apply/sessions", json=body, headers=h)
    assert r.status_code == 200
    out = r.json()
    assert out["provider"] == "linkedin" and out["label"] == "me@x.com"
    assert "top-secret" not in r.text and "storage_state" not in out
    assert [s["provider"] for s in client.get("/api/v1/auto-apply/sessions", headers=h).json()] == ["linkedin"]


def test_api_grant_lifecycle_and_run():
    client, h = _client_and_token()
    grant = client.post("/api/v1/auto-apply/grants", json={
        "name": "Python roles", "scope": "criteria",
        "criteria": {"title_keywords": ["python"]}, "max_submits": 3, "daily_cap": 3,
    }, headers=h).json()
    gid = grant["id"]
    assert grant["status"] == "active" and grant["remaining_total"] == 3
    # pause + resume
    assert client.patch(f"/api/v1/auto-apply/grants/{gid}", json={"status": "paused"}, headers=h).json()["status"] == "paused"
    assert client.patch(f"/api/v1/auto-apply/grants/{gid}", json={"status": "active"}, headers=h).json()["status"] == "active"
    # dry-run with no jobs → eligible 0
    run = client.post(f"/api/v1/auto-apply/grants/{gid}/run", json={"dry_run": True}, headers=h).json()
    assert run["submitted"] == 0 and run["dry_run"] is True
    # delete
    assert client.delete(f"/api/v1/auto-apply/grants/{gid}", headers=h).status_code == 204
    assert client.get(f"/api/v1/auto-apply/grants/{gid}", headers=h).status_code == 404


def test_api_scope_jobs_requires_ids():
    client, h = _client_and_token()
    r = client.post("/api/v1/auto-apply/grants", json={"scope": "jobs", "job_ids": []}, headers=h)
    assert r.status_code == 422


def test_api_approval_endpoints_gate_the_real_submit():
    """A run over the API queues for approval; approve is the only submit path."""
    from jobsearch.engines.assistant.live_fill import MockBrowserDriver

    state = AppState(settings=Settings(auto_apply_live_submit=True), exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    _job(state, "in1", "Python Developer", platform="indeed")
    state.auto_apply._build_driver = lambda settings, platform="", storage_state="": (MockBrowserDriver(), True)

    gid = client.post("/api/v1/auto-apply/grants", json={
        "name": "Python", "scope": "criteria", "criteria": {"title_keywords": ["python"]},
    }, headers=h).json()["id"]
    run = client.post(f"/api/v1/auto-apply/grants/{gid}/run", json={}, headers=h).json()
    assert run["submitted"] == 0
    assert run["outcomes"][0]["status"] == "pending_approval"

    approvals = client.get("/api/v1/auto-apply/approvals", headers=h).json()
    assert len(approvals) == 1 and approvals[0]["title"] == "Python Developer"
    aid = approvals[0]["application_id"]
    # Approve -> the one and only real-submit path.
    out = client.post(f"/api/v1/auto-apply/approvals/{aid}/approve", headers=h).json()
    assert out["status"] == "submitted"
    assert client.get("/api/v1/auto-apply/approvals", headers=h).json() == []
    # Unknown id -> 404 on both approve and reject.
    assert client.post("/api/v1/auto-apply/approvals/app_missing/approve", headers=h).status_code == 404
    assert client.post("/api/v1/auto-apply/approvals/app_missing/reject", headers=h).status_code == 404


# ---- assisted mode (manual Apply → automation fills) ----------------------
def test_linkedin_is_queued_not_submitted():
    state = _state()
    _seed_user(state)
    _job(state, "li1", "Python Engineer", platform="linkedin")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 0
    assert [o.status for o in res.outcomes] == ["queued"]
    assert state.applications.find(user_id="u1") == []  # nothing auto-submitted


def test_mixed_grant_queues_linkedin_submits_others():
    state = _state()
    _seed_user(state)
    _job(state, "li1", "Python Engineer", platform="linkedin", score=90)
    _job(state, "in1", "Python Developer", platform="indeed", score=80)
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 1
    statuses = {o.job_id: o.status for o in res.outcomes}
    assert statuses == {"li1": "queued", "in1": "submitted"}
    assert [a.job_posting_id for a in state.applications.find(user_id="u1")] == ["in1"]


def test_assisted_mode_forces_queue_even_for_indeed():
    state = _state()
    _seed_user(state)
    _job(state, "in1", "Python Developer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", mode="assisted", criteria=AutoApplyCriteria(title_keywords=["python"]))
    res = state.auto_apply.run_grant(grant)
    assert res.submitted == 0 and [o.status for o in res.outcomes] == ["queued"]


def test_queue_has_fields_but_no_credentials():
    state = _state()
    _seed_user(state)
    _job(state, "li1", "Python Engineer", platform="linkedin")
    state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    queue = state.auto_apply.queue("u1")
    assert len(queue) == 1
    item = queue[0]
    assert item.provider == "linkedin" and item.url == "https://jobs/li1"
    assert item.fields.get("email") == "u1@x.com"  # factual field present
    # credential fields never appear
    assert not any(k in item.fields for k in ("account_password", "ssn", "password"))


# ---- cadence / scheduler --------------------------------------------------
def test_due_grants_respects_interval():
    state = _state()
    _seed_user(state)
    manual = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["x"]), interval_minutes=0)
    sched = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["y"]), interval_minutes=60)
    due = [g.id for g in state.auto_apply.due_grants("u1")]
    assert sched.id in due and manual.id not in due  # manual (0) never due
    # after a run, no longer due until the interval elapses
    state.auto_apply.run_grant(sched)
    assert sched.id not in [g.id for g in state.auto_apply.due_grants("u1")]
    sched.last_run_at = utcnow() - timedelta(minutes=61)
    assert sched.id in [g.id for g in state.auto_apply.due_grants("u1")]


def test_run_due_spans_all_users_when_unfiltered():
    state = _state()
    _seed_user(state, "u1")
    _seed_user(state, "u2")
    _job(state, "in1", "Python Developer", platform="indeed")
    state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), interval_minutes=30)
    state.auto_apply.create_grant("u2", criteria=AutoApplyCriteria(title_keywords=["python"]), interval_minutes=30)
    runs = state.auto_apply.run_due(None)  # all users
    assert len(runs) == 2


# ---- API: queue + run-due -------------------------------------------------
def test_api_run_due_and_queue():
    client, h = _client_and_token()
    client.post("/api/v1/auto-apply/grants", json={
        "criteria": {"title_keywords": ["python"]}, "interval_minutes": 30,
    }, headers=h)
    # no jobs → run-due returns a run with 0 submitted; queue empty
    runs = client.post("/api/v1/auto-apply/run-due", json={}, headers=h).json()
    assert isinstance(runs, list) and runs[0]["submitted"] == 0
    assert client.get("/api/v1/auto-apply/queue", headers=h).json() == []
