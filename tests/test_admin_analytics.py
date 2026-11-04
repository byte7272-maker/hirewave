"""Admin analytics dashboard: session gating (admin-email allowlist), per-user rows,
revenue projection, estimated AI cost, and the AI-usage metering wrapper."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.analytics import ai_usage, feature_activity
from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.llm.mock import MockLLMProvider


def _app(**settings_kw):
    s = Settings(plan_limits_enforced=True, **settings_kw)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_admin_me_distinguishes_admin_from_regular_user():
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    reg = _auth(c, "someone@x.com")
    assert c.get("/api/v1/admin/me", headers=boss).json()["is_admin"] is True
    assert c.get("/api/v1/admin/me", headers=reg).json()["is_admin"] is False


def test_analytics_endpoints_require_admin():
    _, c = _app(admin_emails_raw="boss@x.com")
    reg = _auth(c, "nope@x.com")
    assert c.get("/api/v1/admin/analytics/overview", headers=reg).status_code == 403
    assert c.get("/api/v1/admin/analytics/users", headers=reg).status_code == 403


def test_overview_projects_revenue_from_plan_prices():
    # New accounts are on the trial tier; price it at $12/mo in the projection.
    _, c = _app(admin_emails_raw="boss@x.com", plan_prices_raw="free:0,trial:12,tester:0")
    boss = _auth(c, "boss@x.com")
    _auth(c, "u1@x.com")  # a second (trial) user
    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["totals"]["users"] == 2
    assert ov["revenue"]["by_tier"]["trial"]["price"] == 12
    # both accounts are trial → 2 × $12
    assert ov["revenue"]["by_tier"]["trial"]["count"] == 2
    assert ov["revenue"]["monthly_projected"] == 24


def test_ai_cost_is_estimated_from_recorded_usage():
    _, c = _app(
        admin_emails_raw="boss@x.com",
        ai_cost_input_per_1k=0.01,
        ai_cost_output_per_1k=0.02,
    )
    state = c.app.state.jobsearch
    boss = _auth(c, "boss@x.com")
    uid = state.user_by_email("boss@x.com").id
    # 10k input + 10k output tokens → 10×0.01 + 10×0.02 = 0.30
    ai_usage.record(state.documents, actor=uid, in_tokens=10000, out_tokens=10000, model="test")

    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["ai_cost"]["month_to_date_est"] == 0.3
    assert ov["ai_cost"]["ops"] == 1

    rows = c.get("/api/v1/admin/analytics/users", headers=boss).json()
    me = next(r for r in rows if r["email"] == "boss@x.com")
    assert me["ai"]["est_cost"] == 0.3 and me["ai"]["ops"] == 1


def test_user_row_flags_frozen_matches_when_no_feeder():
    # A fresh user with no connected email and no active saved search → matches can't update.
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "frozen@x.com")
    rows = c.get("/api/v1/admin/analytics/users", headers=boss).json()
    frozen = next(r for r in rows if r["email"] == "frozen@x.com")
    assert "matches_frozen_no_feeder" in frozen["flags"]
    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["engagement"]["matches_frozen_no_feeder"] >= 1
    # system health block is present and reports the source mode
    assert ov["system"]["job_source_mode"] in ("mock", "http")


def test_overview_hidden_when_no_admin_emails_configured():
    # Default: nobody is admin, so even a would-be operator is gated out (safe by default).
    _, c = _app()  # admin_emails_raw defaults to ""
    h = _auth(c, "anyone@x.com")
    assert c.get("/api/v1/admin/me", headers=h).json()["is_admin"] is False
    assert c.get("/api/v1/admin/analytics/overview", headers=h).status_code == 403


# --- the metering wrapper (unit) -------------------------------------------
def test_meter_llm_records_estimated_usage_for_current_actor():
    seen = []
    metered = ai_usage.meter_llm(MockLLMProvider(), lambda actor, i, o, m: seen.append((actor, i, o, m)))
    token = ai_usage.set_actor("user-123")
    try:
        out = metered.complete("Summarize this résumé please", system="You are helpful")
    finally:
        ai_usage.reset_actor(token)
    assert isinstance(out, str) and out
    assert len(seen) == 1
    actor, in_tok, out_tok, _model = seen[0]
    assert actor == "user-123" and in_tok > 0 and out_tok > 0


def test_meter_llm_unattributed_calls_bucket_to_system():
    seen = []
    metered = ai_usage.meter_llm(MockLLMProvider(), lambda actor, i, o, m: seen.append(actor))
    ai_usage.set_actor(None)  # no attributed user in this context
    metered.complete("hello")
    assert seen == [ai_usage.SYSTEM_ACTOR]


# --- per-feature interaction tracking --------------------------------------
def test_feature_classifier_maps_core_paths():
    assert feature_activity.classify("/api/v1/resumes/abc/ai-edit") == "resumes"
    assert feature_activity.classify("/api/v1/cover-letters/xyz") == "cover_letters"
    assert feature_activity.classify("/api/v1/job-search/run") == "job_search"
    assert feature_activity.classify("/api/v1/auto-apply/approvals/1/approve") == "applications"
    assert feature_activity.classify("/api/v1/interview/sessions") == "interview"
    assert feature_activity.classify("/api/v1/experience/upload") == "highlights"
    assert feature_activity.classify("/api/v1/integrations/connect/gmail") == "integrations"
    assert feature_activity.classify("/api/v1/auth/login") == ""  # not a core feature


def test_feature_activity_record_and_read(tmp_path):
    from jobsearch.storage import InMemoryDocumentStore

    store = InMemoryDocumentStore()
    feature_activity.record(store, "u1", "resumes")
    feature_activity.record(store, "u1", "resumes")
    feature_activity.record(store, "u1", "job_search")
    act = feature_activity.activity_for(store, "u1")
    assert act["resumes"] == 2 and act["job_search"] == 1 and act["total"] == 3
    # unknown feature is ignored
    feature_activity.record(store, "u1", "nonsense")
    assert feature_activity.activity_for(store, "u1")["total"] == 3


def test_middleware_counts_feature_interactions_end_to_end():
    # A real state-changing request to a core feature increments that user's feature count,
    # and the admin dashboard surfaces it (per-user and in the overview aggregate).
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    r = c.post("/api/v1/resumes/upload", headers=boss,
               files={"file": ("r.txt", b"My resume: Python engineer, led teams.", "text/plain")})
    assert r.status_code == 201, r.text

    rows = c.get("/api/v1/admin/analytics/users", headers=boss).json()
    me = next(x for x in rows if x["email"] == "boss@x.com")
    assert me["features"]["resumes"] >= 1 and me["features"]["total"] >= 1

    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["engagement"]["feature_interactions"]["resumes"] >= 1
