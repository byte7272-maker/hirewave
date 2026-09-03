"""Minimal-footprint connect-pairing flow (intent → helper submit → poll)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="cxn@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "C"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_full_connect_flow_and_ai_access():
    client = _client()
    h = _auth(client)
    # 1) app issues a pairing code (authenticated)
    intent = client.post("/api/v1/auto-apply/sessions/connect-intent", headers=h, json={"provider": "linkedin"}).json()
    code = intent["code"]
    assert intent["status"] == "pending" and intent["provider"] == "linkedin" and code

    # 2) app polls: still pending
    assert client.get(f"/api/v1/auto-apply/sessions/connect-intent/{code}", headers=h).json()["status"] == "pending"

    # 3) capture helper submits the session with ONLY the code (no login token)
    r = client.post("/api/v1/auto-apply/sessions/connect",
                    json={"code": code, "storage_state": "{\"cookies\":[]}", "label": "me@x.com"})
    assert r.status_code == 200 and r.json()["status"] == "connected"

    # 4) app polls: connected
    st = client.get(f"/api/v1/auto-apply/sessions/connect-intent/{code}", headers=h).json()
    assert st["status"] == "connected" and st["session_id"]

    # 5) the session now exists and connected-apps shows LinkedIn authenticated + AI access
    apps = {a["provider"]: a for a in client.get("/api/v1/integrations/connected-apps", headers=h).json()}
    assert apps["linkedin"]["authenticated"] is True and apps["linkedin"]["ai_access"] is True
    assert apps["linkedin"]["account_label"] == "me@x.com"


def test_invalid_and_reused_code():
    client = _client()
    h = _auth(client)
    # invalid code
    assert client.post("/api/v1/auto-apply/sessions/connect",
                       json={"code": "nope", "storage_state": "{}"}).status_code == 400
    # reuse a valid code twice
    code = client.post("/api/v1/auto-apply/sessions/connect-intent", headers=h, json={"provider": "indeed"}).json()["code"]
    assert client.post("/api/v1/auto-apply/sessions/connect", json={"code": code, "storage_state": "{}"}).status_code == 200
    assert client.post("/api/v1/auto-apply/sessions/connect", json={"code": code, "storage_state": "{}"}).status_code == 400


def test_connect_requires_storage_state():
    client = _client()
    h = _auth(client)
    code = client.post("/api/v1/auto-apply/sessions/connect-intent", headers=h, json={"provider": "linkedin"}).json()["code"]
    assert client.post("/api/v1/auto-apply/sessions/connect", json={"code": code, "storage_state": "   "}).status_code == 400


def test_intent_requires_auth_and_status_owner_scoped():
    client = _client()
    assert client.post("/api/v1/auto-apply/sessions/connect-intent", json={"provider": "linkedin"}).status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    code = client.post("/api/v1/auto-apply/sessions/connect-intent", headers=ha, json={"provider": "linkedin"}).json()["code"]
    # B cannot see A's connect status
    assert client.get(f"/api/v1/auto-apply/sessions/connect-intent/{code}", headers=hb).status_code == 404
