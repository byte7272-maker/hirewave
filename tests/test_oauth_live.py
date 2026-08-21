"""Live OAuth token exchange — exercised offline by monkeypatching httpx.post.

This drives the real HttpxTokenExchanger + IntegrationEngine code path end to
end (build request → exchange code → encrypt/store → decrypt/refresh) without a
real provider, and checks the failure/misconfig/redirect behaviors.
"""

from __future__ import annotations

import pytest

from jobsearch.config import Settings
from jobsearch.engines.integration import (
    HttpxTokenExchanger,
    IntegrationEngine,
    MockTokenExchanger,
)
from jobsearch.engines.integration.engine import IntegrationError
from jobsearch.models import Provider


class _FakeResp:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._payload


def _patch_post(monkeypatch, resp, sink=None):
    import httpx

    def fake_post(url, data=None, headers=None, timeout=None):
        if sink is not None:
            sink["url"] = url
            sink["data"] = data
        return resp

    monkeypatch.setattr(httpx, "post", fake_post)


def _live_settings(monkeypatch, **creds):
    for k, v in creds.items():
        monkeypatch.setenv(k, v)
    return Settings(oauth_mode="live")


def test_real_exchange_flow(monkeypatch):
    sink: dict = {}
    _patch_post(
        monkeypatch,
        _FakeResp(payload={
            "access_token": "real-access",
            "refresh_token": "real-refresh",
            "expires_in": 3600,
            "scope": "openid email",
        }),
        sink,
    )
    settings = _live_settings(monkeypatch, GOOGLE_CLIENT_ID="gid", GOOGLE_CLIENT_SECRET="gsec")
    engine = IntegrationEngine(exchanger=HttpxTokenExchanger(), settings=settings)

    token = engine.complete_authorization(
        "u1", Provider.GMAIL, code="authcode", code_verifier="verifier-123"
    )
    # Token is encrypted at rest but reveals the real access token.
    assert token.access_token.startswith("v1:")
    assert engine.get_access_token("u1", Provider.GMAIL) == "real-access"

    # The real RFC 6749 request was built correctly.
    assert sink["url"] == "https://oauth2.googleapis.com/token"
    assert sink["data"]["grant_type"] == "authorization_code"
    assert sink["data"]["code"] == "authcode"
    assert sink["data"]["client_id"] == "gid"
    assert sink["data"]["client_secret"] == "gsec"
    assert sink["data"]["code_verifier"] == "verifier-123"  # Google uses PKCE


def test_real_refresh_on_expiry(monkeypatch):
    _patch_post(
        monkeypatch,
        _FakeResp(payload={"access_token": "a1", "refresh_token": "r1", "expires_in": 3600}),
    )
    settings = _live_settings(monkeypatch, INDEED_CLIENT_ID="iid", INDEED_CLIENT_SECRET="isec")
    engine = IntegrationEngine(exchanger=HttpxTokenExchanger(), settings=settings)
    engine.complete_authorization("u1", Provider.INDEED, code="c", code_verifier="v")

    # Force expiry, then a refreshed token comes back.
    from jobsearch.models.common import utcnow
    from datetime import timedelta

    rec = engine.tokens.get_record("u1", Provider.INDEED)
    rec.expires_at = utcnow() - timedelta(minutes=5)
    engine.tokens._repo.add(rec)  # persist the forced expiry (harmless for in-memory)

    _patch_post(
        monkeypatch,
        _FakeResp(payload={"access_token": "a2", "expires_in": 3600}),  # no new refresh token
    )
    assert engine.get_access_token("u1", Provider.INDEED) == "a2"


def test_exchange_error_becomes_integration_error(monkeypatch):
    _patch_post(monkeypatch, _FakeResp(status_code=400, text='{"error":"invalid_grant"}'))
    settings = _live_settings(monkeypatch, LINKEDIN_CLIENT_ID="lid", LINKEDIN_CLIENT_SECRET="lsec")
    engine = IntegrationEngine(exchanger=HttpxTokenExchanger(), settings=settings)
    with pytest.raises(IntegrationError):
        engine.complete_authorization("u1", Provider.LINKEDIN, code="bad")


def test_live_mode_missing_credentials_raises(monkeypatch):
    for var in ("WORKDAY_CLIENT_ID", "WORKDAY_CLIENT_SECRET"):
        monkeypatch.delenv(var, raising=False)
    engine = IntegrationEngine(
        exchanger=HttpxTokenExchanger(), settings=Settings(oauth_mode="live")
    )
    with pytest.raises(IntegrationError):
        engine.build_authorization_request(Provider.WORKDAY)


def test_state_selects_exchanger_by_mode():
    from jobsearch.api.state import AppState

    live = AppState(settings=Settings(oauth_mode="live"))
    assert isinstance(live.integration.exchanger, HttpxTokenExchanger)

    mock = AppState(settings=Settings(oauth_mode="mock"))
    assert isinstance(mock.integration.exchanger, MockTokenExchanger)


# --- API-level ---------------------------------------------------------------
def _client(settings, exchanger=None):
    from fastapi.testclient import TestClient

    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState

    state = AppState(settings=settings, exchanger=exchanger)
    return TestClient(create_app(state=state))


def _auth(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "sam@demo.com", "password": "supersecret", "full_name": "Sam"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_connect_live_without_credentials_returns_400():
    client = _client(Settings(oauth_mode="live"), exchanger=HttpxTokenExchanger())
    h = _auth(client)
    r = client.post("/api/v1/integrations/connect/linkedin", headers=h)
    assert r.status_code == 400
    assert "not configured" in r.json()["detail"]


def test_api_callback_redirects_to_frontend():
    settings = Settings(oauth_success_redirect="http://localhost:3000/integrations")
    client = _client(settings, exchanger=MockTokenExchanger())
    h = _auth(client)
    conn = client.post("/api/v1/integrations/connect/linkedin", headers=h).json()

    r = client.get(
        "/api/v1/integrations/callback/linkedin",
        params={"code": "abc", "state": conn["state"]},
        follow_redirects=False,
    )
    assert r.status_code == 302
    assert r.headers["location"] == "http://localhost:3000/integrations?connected=linkedin"

    # And the integration really connected.
    conns = client.get("/api/v1/integrations", headers=h).json()
    assert any(c["provider"] == "linkedin" for c in conns)


def test_api_callback_redirects_on_user_denied():
    settings = Settings(oauth_success_redirect="http://localhost:3000/integrations")
    client = _client(settings, exchanger=MockTokenExchanger())
    _auth(client)
    r = client.get(
        "/api/v1/integrations/callback/linkedin",
        params={"error": "access_denied"},
        follow_redirects=False,
    )
    assert r.status_code == 302
    assert "error=access_denied" in r.headers["location"]
