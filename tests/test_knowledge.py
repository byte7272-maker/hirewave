"""Dynamic knowledge base: override merge, per-user vs global scope, and that the
troubleshooting DB + the tailor flow reflect runtime corrections."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import capabilities as caps
from jobsearch.engines.assistant import knowledge as kb
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import KnowledgeEntry
from jobsearch.models.common import utcnow


# --- pure merge -------------------------------------------------------------
def _e(scope, category, key, data, mins=0):
    return KnowledgeEntry(scope=scope, category=category, key=key, data=data,
                          updated_at=utcnow() - timedelta(minutes=mins))


def test_overrides_user_wins_over_global_and_latest_wins():
    entries = [
        _e("global", "troubleshooting", "not_linked", {"fix": "global fix"}, mins=10),
        _e("u1", "troubleshooting", "not_linked", {"fix": "my fix"}, mins=5),
        _e("u1", "troubleshooting", "not_linked", {"fix": "my newer fix"}, mins=1),
        _e("u2", "troubleshooting", "not_linked", {"fix": "other user"}, mins=0),
        _e("global", "troubleshooting", "network", {"fix": "g-net"}, mins=0),
    ]
    ov = kb.overrides_for(entries, "troubleshooting", "u1")
    assert ov["not_linked"]["fix"] == "my newer fix"   # user + latest wins
    assert ov["network"]["fix"] == "g-net"             # global applies too
    # a different user doesn't see u1's personal override
    assert kb.overrides_for(entries, "troubleshooting", "u2")["not_linked"]["fix"] == "other user"


def test_merge_adds_merges_and_removes():
    static = {"a": {"x": 1, "y": 2}, "b": {"z": 3}}
    merged = kb.merge(static, {"a": {"y": 20, "w": 9}, "c": {"new": 1}, "b": {"_remove": True}})
    assert merged["a"] == {"x": 1, "y": 20, "w": 9}  # merged
    assert merged["c"] == {"new": 1}                 # added
    assert "b" not in merged                         # removed
    assert static["a"] == {"x": 1, "y": 2}           # original untouched


def test_inactive_override_ignored():
    e = _e("global", "troubleshooting", "not_linked", {"fix": "x"})
    e.active = False
    assert kb.overrides_for([e], "troubleshooting") == {}


# --- the tailor flow is now a real, job-specific walkthrough ----------------
def test_tailor_flow_exists_and_is_job_specific():
    flows = caps.manifest()["flows"]
    assert "tailor" in flows
    t = flows["tailor"]
    assert t["ask"] in t["speak"] and t["focus"]
    # the proposing line asks a yes/no and the fit line names the job + gaps (not generic)
    assert t["speak"]["proposing"].rstrip().endswith("?")
    assert "{job}" in t["speak"]["start"] and "{missing}" in t["speak"]["fit"]
    assert "{score}" in t["speak"]["fit"] and "{example}" in t["speak"]["proposing"]


# --- endpoints --------------------------------------------------------------
def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(c, email="kb@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "K"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_user_override_corrects_troubleshooting_and_reverts():
    c = _client()
    h = _auth(c)
    # correct the 'not_linked' fix for this user
    up = c.put("/api/v1/assistant/knowledge", headers=h, json={
        "category": "troubleshooting", "key": "not_linked",
        "data": {"fix": "Open Settings → Extensions → Link (proven clearer)."},
        "note": "clearer wording"}).json()
    assert up["scope"] == "me"
    # it shows up in the user's troubleshooting DB
    r = c.get("/api/v1/assistant/troubleshooting", headers=h, params={"q": "not linked"}).json()
    nl = next(m for m in r["matches"] if m["kind"] == "not_linked")
    assert "proven clearer" in nl["fix"]
    # listed, then reverted
    assert any(e["key"] == "not_linked" for e in c.get("/api/v1/assistant/knowledge", headers=h).json()["entries"])
    assert c.delete(f"/api/v1/assistant/knowledge/{up['id']}", headers=h).status_code == 204
    r2 = c.get("/api/v1/assistant/troubleshooting", headers=h, params={"q": "not linked"}).json()
    assert "proven clearer" not in next(m for m in r2["matches"] if m["kind"] == "not_linked")["fix"]


def test_global_override_requires_admin_token():
    c = _client()
    h = _auth(c)
    r = c.put("/api/v1/assistant/knowledge", headers=h, json={
        "category": "troubleshooting", "key": "network", "data": {"fix": "x"}, "scope": "global"})
    assert r.status_code == 403  # admin token not set/provided


def test_knowledge_validates_category():
    c = _client()
    h = _auth(c)
    assert c.put("/api/v1/assistant/knowledge", headers=h,
                 json={"category": "bogus", "key": "x", "data": {}}).status_code == 400
