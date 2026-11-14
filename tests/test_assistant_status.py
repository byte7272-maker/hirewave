"""The assistant status-report endpoint — the concrete action behind the dashboard's
'Want a quick status report?' offer (intent status_report). It must return a
ready-to-speak summary and the figures to highlight, for any account."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _app():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="status@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "S"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_status_report_is_speakable_for_a_fresh_account():
    _, c = _app()
    h = _auth(c)
    r = c.get("/api/v1/assistant/status", headers=h)
    assert r.status_code == 200
    body = r.json()
    # A spoken line always comes back — the button is never a no-op.
    assert body["reply"].strip()
    assert body["headline"].strip()
    # Figures to show/highlight, each well-formed.
    assert body["items"] and all(i.get("label") and i.get("highlight") for i in body["items"])
    labels = {i["label"] for i in body["items"]}
    assert {"Matches", "Applications", "Interviews", "Weekly goal"} <= labels


def test_status_report_requires_auth():
    _, c = _app()
    assert c.get("/api/v1/assistant/status").status_code == 401


def test_status_report_mentions_preferences_when_unset():
    _, c = _app()
    h = _auth(c)
    body = c.get("/api/v1/assistant/status", headers=h).json()
    # A brand-new account has no matches and no preferences — the status says so
    # (so the user knows WHY, and what to do), rather than a bare "0 matches".
    assert body["needs_preferences"] is True
    assert "preference" in body["reply"].lower()
