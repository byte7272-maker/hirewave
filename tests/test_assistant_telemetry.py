"""Assistant learning telemetry (P182): event folding, PII scrub + caps, the admin
digest aggregation, and the two endpoints (user-authenticated ingest + admin insights)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.analytics import assistant_telemetry as tel
from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _app(**settings_kw):
    s = Settings(**settings_kw)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# --- storage unit tests -----------------------------------------------------
class _MemStore:
    """Minimal (bytes, content_type) KV store matching the document-store interface."""

    def __init__(self):
        self.d: dict[str, bytes] = {}

    def get(self, key):
        v = self.d.get(key)
        return (v, "application/json") if v is not None else None

    def put(self, key, value, content_type="application/octet-stream"):
        self.d[key] = value


def test_normalize_scrubs_pii_and_truncates():
    assert tel.normalize_utterance("  Email ME at Jo@x.com now ") == "email me at <email> now"
    assert "<number>" in tel.normalize_utterance("call 555-123-4567")
    assert "<number>" in tel.normalize_utterance("ref 1234567")
    assert len(tel.normalize_utterance("x" * 200)) <= 80


def test_record_folds_status_paths_questions_and_features():
    st = _MemStore()
    n = tel.record(st, "u1", [
        {"utterance": "design my resume", "path": "typed", "status": "resolved", "feature": "design", "outcome": "completed"},
        {"utterance": "design my resume", "path": "voice", "status": "resolved", "feature": "design", "outcome": "abandoned"},
        {"utterance": "export to pdf", "path": "typed", "status": "failed", "failure_class": "missing_capability", "feature": ""},
    ])
    assert n == 3
    out = tel.insights(st, ["u1"], months=1)
    assert out["totals"]["events"] == 3
    assert out["totals"]["status"] == {"resolved": 2, "clarified": 0, "failed": 1}
    assert out["totals"]["paths"] == {"chip": 0, "typed": 2, "voice": 1}
    # top question clustered by normalized utterance
    assert out["top_questions"][0] == {"text": "design my resume", "count": 2}
    # failure surfaced with class + example
    fail = out["top_failures"][0]
    assert fail["class"] == "missing_capability" and fail["count"] == 1
    assert fail["examples"][0]["text"] == "export to pdf"
    # feature usage with completion rate
    design = next(f for f in out["feature_usage"] if f["feature"] == "design")
    assert design["total"] == 2 and design["completed"] == 1 and design["abandoned"] == 1
    assert design["completion_rate"] == 0.5


def test_unknown_enum_values_are_dropped_not_stored():
    st = _MemStore()
    tel.record(st, "u1", [
        {"utterance": "hi", "path": "banana", "status": "weird", "feature": "nope"},
    ])
    out = tel.insights(st, ["u1"], months=1)
    assert out["totals"]["events"] == 1
    assert sum(out["totals"]["status"].values()) == 0  # bad status ignored
    assert sum(out["totals"]["paths"].values()) == 0   # bad path ignored
    assert out["feature_usage"] == []                  # bad feature ignored


def test_questions_dict_is_capped():
    st = _MemStore()
    # Push well past the cap with unique, increasingly frequent phrases.
    events = []
    for i in range(tel._MAX_QUESTIONS + 50):
        events.extend([{"utterance": f"q{i}", "status": "resolved"}] * (1 if i < 250 else 3))
    tel.record(st, "u1", events)
    doc = tel._load(st, tel._doc_key(tel.month_key(), "u1"))
    assert len(doc["questions"]) <= tel._MAX_QUESTIONS


def test_insights_merges_across_users_and_trend_has_month():
    st = _MemStore()
    tel.record(st, "a", [{"utterance": "show matches", "status": "resolved", "feature": "matches", "outcome": "completed"}])
    tel.record(st, "b", [{"utterance": "show matches", "status": "resolved", "feature": "matches", "outcome": "completed"}])
    out = tel.insights(st, ["a", "b"], months=1)
    assert out["top_questions"][0] == {"text": "show matches", "count": 2}
    assert out["trend"][-1]["month"] == tel.month_key()
    assert out["trend"][-1]["events"] == 2


# --- endpoint tests ---------------------------------------------------------
def test_telemetry_ingest_requires_auth():
    _, c = _app()
    assert c.post("/api/v1/assistant/telemetry", json={"events": []}).status_code in (401, 403)


def test_ingest_then_admin_insights_roundtrip():
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    reg = _auth(c, "user@x.com")

    r = c.post("/api/v1/assistant/telemetry", headers=reg, json={"events": [
        {"utterance": "design my resume", "path": "voice", "status": "resolved", "feature": "design", "outcome": "completed"},
        {"utterance": "can you export to pdf", "path": "typed", "status": "failed", "failure_class": "missing_capability"},
    ]})
    assert r.status_code == 200 and r.json()["accepted"] == 2

    # non-admin cannot read the digest
    assert c.get("/api/v1/admin/assistant/insights", headers=reg).status_code == 403

    digest = c.get("/api/v1/admin/assistant/insights", headers=boss)
    assert digest.status_code == 200
    body = digest.json()
    assert body["totals"]["events"] == 2
    assert any(q["text"] == "design my resume" for q in body["top_questions"])
    assert body["top_failures"][0]["class"] == "missing_capability"
    assert any(f["feature"] == "design" for f in body["feature_usage"])


def test_record_feedback_scrubs_and_recent_returns_newest_first():
    from datetime import timedelta
    from jobsearch.models.common import utcnow
    st = _MemStore()
    t1 = utcnow()
    t2 = t1 + timedelta(minutes=1)
    assert tel.record_feedback(st, "u1", "Confusing: it emailed me at a@b.com", section="matches", now=t1)
    assert tel.record_feedback(st, "u1", "Second note", utterance="change the email", intent="ask", now=t2)
    items = tel.recent_feedback(st, ["u1"], months=1)
    assert len(items) == 2 and items[0]["note"] == "Second note"  # newest first
    assert "<email>" in items[1]["note"] and "a@b.com" not in items[1]["note"]  # PII scrubbed
    assert items[0]["intent"] == "ask"
    # empty note is rejected
    assert tel.record_feedback(st, "u1", "   ") is False


def test_feedback_endpoint_and_admin_digest_includes_it():
    _, c = _app(admin_emails_raw="boss@x.com")
    boss = _auth(c, "boss@x.com")
    reg = _auth(c, "user@x.com")
    r = c.post("/api/v1/assistant/feedback", headers=reg,
               json={"note": "The walkthrough kept repeating", "section": "matches", "intent": "walk_matches"})
    assert r.status_code == 200 and r.json()["accepted"] is True
    assert c.post("/api/v1/assistant/feedback", json={"note": "x"}).status_code in (401, 403)

    body = c.get("/api/v1/admin/assistant/insights", headers=boss).json()
    assert any(f["note"] == "The walkthrough kept repeating" for f in body["feedback"])


def test_ingest_batch_cap_is_enforced():
    _, c = _app()
    reg = _auth(c, "user@x.com")
    big = {"events": [{"utterance": f"q{i}", "status": "resolved"} for i in range(500)]}
    r = c.post("/api/v1/assistant/telemetry", headers=reg, json=big)
    assert r.status_code == 200
    # Only the first _TELEMETRY_BATCH_CAP are accepted.
    from jobsearch.api.routers.assistant import _TELEMETRY_BATCH_CAP
    assert r.json()["accepted"] == _TELEMETRY_BATCH_CAP
