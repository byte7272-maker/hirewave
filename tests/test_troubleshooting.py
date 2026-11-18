"""Assistant error handling: classification, acknowledgments (never silent), the
troubleshooting database, and the error log endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import troubleshooting as ts
from jobsearch.engines.integration import MockTokenExchanger


# --- pure engine ------------------------------------------------------------
def test_classify_from_kind_and_message():
    assert ts.classify("not_linked", "") == "not_linked"
    assert ts.classify("", "(403) permission needed") == "permission_denied"
    assert ts.classify("", "couldn't make out what you said") == "mic_unintelligible"
    assert ts.classify("", "failed to fetch") == "network"
    assert ts.classify("", "something weird") == "unknown"


def test_acknowledge_is_never_empty():
    # the whole point: always say something, never go silent
    for kind in list(ts.TROUBLESHOOTING) + ["", "garbage-kind"]:
        assert ts.acknowledge(kind).strip()


def test_mic_errors_ask_again_not_swallow():
    for kind in ("mic_no_input", "mic_unintelligible", "nonsense_input", "empty_input"):
        h = ts.handle(kind)
        assert h["ask_again"] is True
        assert h["reply"].strip().endswith("?") or "ready" in h["reply"].lower()


def test_actionable_error_includes_fix():
    h = ts.handle("not_linked")
    assert h["ask_again"] is False
    assert h["fix"] and h["fix"] in h["reply"]  # the fix is spoken for actionable errors
    assert h["cause"]


def test_retryable_flags():
    assert ts.handle("network")["retry"] is True
    assert ts.handle("rate_limited")["retry"] is True
    assert ts.handle("not_found")["retry"] is False


def test_search_database():
    hits = ts.search("mic not working")
    assert hits and any(h["kind"].startswith("mic") for h in hits)
    linked = ts.search("link the extension")
    assert linked and linked[0]["kind"] == "not_linked"
    # empty query returns the catalog
    assert len(ts.search("")) >= 8


# --- endpoints + persistence ------------------------------------------------
def _client():
    state = AppState(exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def _auth(c, email="err@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "E"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_report_error_acknowledges_and_logs():
    c, _ = _client()
    h = _auth(c)
    # a bad mic read → re-ask, and it's logged with a cause + time
    r = c.post("/api/v1/assistant/error", headers=h,
               json={"message": "couldn't make out the audio", "context": "voice"})
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "mic_unintelligible" and body["ask_again"] is True
    assert body["reply"].strip()

    # an actionable error with an explicit kind → fix is included
    c.post("/api/v1/assistant/error", headers=h, json={"kind": "not_linked", "context": "sync"})

    log = c.get("/api/v1/assistant/errors", headers=h).json()
    assert log["total"] == 2
    assert log["by_kind"].get("mic_unintelligible") == 1 and log["by_kind"].get("not_linked") == 1
    assert all(e.get("at") and e.get("cause") for e in log["errors"])


def test_troubleshooting_endpoint_searchable():
    c, _ = _client()
    h = _auth(c)
    r = c.get("/api/v1/assistant/troubleshooting", headers=h, params={"q": "not linked"})
    assert r.status_code == 200
    assert r.json()["matches"][0]["kind"] == "not_linked"


def test_error_endpoints_require_auth():
    c, _ = _client()
    assert c.post("/api/v1/assistant/error", json={"message": "x"}).status_code == 401
    assert c.get("/api/v1/assistant/errors").status_code == 401


def test_ios_mic_allowed_but_refusing_is_its_own_case():
    # "allowed in settings but still blocked" on iOS is the Apple limitation, not a settings
    # fix — it must route to type-first guidance, distinct from the generic mic_blocked.
    for msg in ("mic is allowed in settings but still blocked",
                "I set Safari to allow but the mic refuses",
                "ios voice keeps being blocked even though allowed"):
        assert ts.classify("", msg) == "mic_ios_unreliable", (msg, ts.classify("", msg))
    h = ts.handle("mic_ios_unreliable")
    assert "type" in h["fix"].lower() and h["ack"].strip()
    # a plain "blocked for this site" is still the generic case (press-and-hold prompt)
    assert ts.classify("", "microphone blocked for this site") == "mic_blocked"


def test_document_assistant_error_awareness():
    # P275/P276 flows: each new failure mode classifies, acknowledges (never silent), and
    # carries an actionable fix.
    cases = {
        "no readable text in this résumé": "no_document_text",
        "no pages fetched from the search": "no_sources_fetched",
        "couldn't find a newer figure": "metric_not_found",
        "this résumé has no summary": "no_summary",
        "couldn't find that word in the document": "locate_no_match",
    }
    for msg, kind in cases.items():
        assert ts.classify("", msg) == kind, (msg, ts.classify("", msg))
        h = ts.handle(kind)
        assert h["ack"].strip() and h["fix"].strip()
    # the refresh/research network issue is worth an auto-retry; the "not found" ones are not
    assert ts.lookup("no_sources_fetched")["retry"] is True
    assert ts.lookup("metric_not_found")["retry"] is False
