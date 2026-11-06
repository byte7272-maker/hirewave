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


# --- iCloud/IMAP counts as an email feeder ---------------------------------
def test_icloud_connection_counts_as_email_feeder():
    # A connected iCloud inbox must count like Gmail: email_connected True, named in
    # email_providers, and NOT flagged matches_frozen_no_feeder.
    from jobsearch.models import Provider

    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "mac@x.com")
    uid = state.user_by_email("mac@x.com").id
    state.integration.connect_imap(uid, Provider.ICLOUD, username="mac@icloud.com", password="pw")

    row = next(r for r in c.get("/api/v1/admin/analytics/users", headers=boss).json()
               if r["email"] == "mac@x.com")
    assert row["engagement"]["email_connected"] is True
    assert "icloud" in row["engagement"]["email_providers"]
    assert "matches_frozen_no_feeder" not in row["flags"]

    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["engagement"]["email_providers"].get("icloud", 0) >= 1


# --- real vs seed/test accounts --------------------------------------------
def test_is_test_user_email_matches_domains_and_subdomains():
    s = Settings()
    assert s.is_test_user_email("a@test.dev") is True
    assert s.is_test_user_email("a@sub.test.dev") is True
    assert s.is_test_user_email("a@example.com") is True
    assert s.is_test_user_email("a@gmail.com") is False
    assert s.is_test_user_email("boss@x.com") is False


def test_overview_splits_real_vs_test_accounts_and_users_can_exclude_them():
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")       # real (x.com isn't a test domain)
    _auth(c, "seed@test.dev")           # seed/test domain
    _auth(c, "demo@example.com")        # seed/test domain

    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["totals"]["users"] == 3
    assert ov["totals"]["test_users"] == 2
    assert ov["totals"]["real_users"] == 1

    # exclude_test hides the seed accounts
    kept = {r["email"] for r in c.get("/api/v1/admin/analytics/users?exclude_test=true", headers=boss).json()}
    assert kept == {"boss@x.com"}

    # per-row is_test flag
    allrows = c.get("/api/v1/admin/analytics/users", headers=boss).json()
    assert next(r for r in allrows if r["email"] == "seed@test.dev")["is_test"] is True
    assert next(r for r in allrows if r["email"] == "boss@x.com")["is_test"] is False


# --- prune seed/test accounts ----------------------------------------------
def test_prune_requires_admin():
    _, c = _app(admin_emails_raw="boss@x.com")
    h = _auth(c, "nope@x.com")
    assert c.post("/api/v1/admin/accounts/prune", headers=h, json={}).status_code == 403


def test_prune_dry_run_lists_test_accounts_without_deleting():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "seed@test.dev")
    _auth(c, "demo@example.com")
    _auth(c, "real@x.com")  # real domain → not selected
    b = c.post("/api/v1/admin/accounts/prune", headers=boss, json={}).json()
    assert b["dry_run"] is True and b["deleted"] == 0
    assert b["matched"] == 2 and set(b["sample"]) == {"seed@test.dev", "demo@example.com"}
    # nothing was actually removed
    assert c.get("/api/v1/admin/analytics/overview", headers=boss).json()["totals"]["users"] == 4


def test_prune_confirm_deletes_only_test_accounts():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "seed@test.dev")
    _auth(c, "real@x.com")
    r = c.post("/api/v1/admin/accounts/prune", headers=boss, json={"confirm": True})
    assert r.json()["deleted"] == 1
    ov = c.get("/api/v1/admin/analytics/overview", headers=boss).json()
    assert ov["totals"]["users"] == 2  # boss + real remain
    assert state.user_by_email("seed@test.dev") is None
    assert state.user_by_email("real@x.com") is not None


def test_prune_never_deletes_admin_or_caller_even_on_test_domain():
    state, c = _app(admin_emails_raw="boss@test.dev")  # admin's own email is a test domain
    boss = _auth(c, "boss@test.dev")
    _auth(c, "seed@test.dev")
    b = c.post("/api/v1/admin/accounts/prune", headers=boss, json={"confirm": True}).json()
    assert b["deleted"] == 1 and b["protected_skipped"] >= 1
    assert state.user_by_email("boss@test.dev") is not None   # admin survived
    assert state.user_by_email("seed@test.dev") is None


def test_prune_confirm_refuses_over_max_delete():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "a@test.dev")
    _auth(c, "b@test.dev")
    r = c.post("/api/v1/admin/accounts/prune", headers=boss, json={"confirm": True, "max_delete": 1})
    assert r.status_code == 400
    assert state.user_by_email("a@test.dev") is not None  # nothing deleted


def test_prune_by_explicit_emails_only():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "keep@test.dev")
    _auth(c, "zap@test.dev")
    r = c.post("/api/v1/admin/accounts/prune", headers=boss,
               json={"confirm": True, "test_domains": False, "emails": ["zap@test.dev"]})
    assert r.json()["deleted"] == 1
    assert state.user_by_email("zap@test.dev") is None
    assert state.user_by_email("keep@test.dev") is not None


# --- migrate one account's data to another ---------------------------------
def test_migrate_requires_admin():
    _, c = _app(admin_emails_raw="boss@x.com")
    h = _auth(c, "nope@x.com")
    r = c.post("/api/v1/admin/accounts/migrate", headers=h,
               json={"from_email": "a@x.com", "to_email": "b@x.com"})
    assert r.status_code == 403


def test_migrate_target_must_exist():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "old@x.com")
    r = c.post("/api/v1/admin/accounts/migrate", headers=boss,
               json={"from_email": "old@x.com", "to_email": "ghost@x.com"})
    assert r.status_code == 400 and "target account not found" in r.text


def test_migrate_same_account_rejected():
    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    _auth(c, "same@x.com")
    r = c.post("/api/v1/admin/accounts/migrate", headers=boss,
               json={"from_email": "same@x.com", "to_email": "same@x.com"})
    assert r.status_code == 400


def test_migrate_dry_run_then_moves_data():
    from jobsearch.models.user import UserProfile

    state, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    old = _auth(c, "old@x.com")   # the re-created-elsewhere source (e.g. iCloud)
    _auth(c, "new@x.com")         # the target (e.g. Gmail), freshly signed in
    old_uid = state.user_by_email("old@x.com").id
    new_uid = state.user_by_email("new@x.com").id

    # give the source a résumé (track it by id — new accounts also get a demo sample) + a profile setting
    r = c.post("/api/v1/resumes/upload", headers=old,
               files={"file": ("r.txt", b"My resume: Python engineer, led teams.", "text/plain")})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert state.resumes.get(rid).user_id == old_uid
    prof = state.profiles.get(old_uid) or UserProfile(user_id=old_uid)
    prof.headline = "Staff Engineer"
    state.profiles.add(prof)

    # dry run moves nothing
    dry = c.post("/api/v1/admin/accounts/migrate", headers=boss,
                 json={"from_email": "old@x.com", "to_email": "new@x.com"}).json()
    assert dry["dry_run"] is True and dry["would_move"].get("resumes", 0) >= 1
    assert state.resumes.get(rid).user_id == old_uid  # not moved yet

    # confirm actually moves it
    done = c.post("/api/v1/admin/accounts/migrate", headers=boss,
                  json={"from_email": "old@x.com", "to_email": "new@x.com", "confirm": True}).json()
    assert done["dry_run"] is False and done["moved"].get("resumes", 0) >= 1
    assert state.resumes.get(rid).user_id == new_uid       # the real résumé now belongs to the target
    assert all(x.user_id != old_uid for x in state.resumes.find(user_id=old_uid))  # none left on source
    # the profile (a setting) moved to the target
    assert state.profiles.get(new_uid).headline == "Staff Engineer"
    # source account still exists (emptied) unless delete_source was set
    assert state.user_by_email("old@x.com") is not None


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
