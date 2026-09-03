"""The authenticated-apps section — job sites + auth status through Hirewave."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="apps@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_default_all_apps_listed_unauthenticated():
    client = _client()
    h = _auth(client)
    apps = client.get("/api/v1/integrations/connected-apps", headers=h).json()
    keys = {a["provider"] for a in apps}
    assert {"linkedin", "indeed", "greenhouse", "workday"} <= keys
    for a in apps:
        assert a["authenticated"] is False
        assert a["status"] == "not_connected"
        assert a["ai_access"] is False
        assert "name" in a and "supports_auto_apply" in a


def test_connected_browser_session_shows_authenticated_with_ai_access():
    client = _client()
    h = _auth(client)
    # user connects a LinkedIn session (the auto-apply session store)
    r = client.post("/api/v1/auto-apply/sessions", headers=h,
                    json={"provider": "linkedin", "storage_state": "{\"cookies\":[]}", "label": "me@x.com"})
    assert r.status_code in (200, 201)
    apps = {a["provider"]: a for a in client.get("/api/v1/integrations/connected-apps", headers=h).json()}
    li = apps["linkedin"]
    assert li["authenticated"] is True
    assert li["status"] == "connected"
    assert li["method"] == "browser_session"
    assert li["ai_access"] is True  # supported + authenticated
    assert li["account_label"] == "me@x.com"
    # a site with no session stays unauthenticated
    assert apps["workday"]["authenticated"] is False


def test_connected_apps_requires_auth():
    client = _client()
    assert client.get("/api/v1/integrations/connected-apps").status_code == 401
