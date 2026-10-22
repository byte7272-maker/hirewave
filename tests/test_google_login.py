"""Sign in with Google (server-side OIDC login) — /auth/google/login + callback."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration.exchangers import TokenResponse


class _FakeGoogleExchanger:
    """Returns an OIDC-ish token whose raw carries the signed-in email."""

    def __init__(self, email: str, name: str = "Tester") -> None:
        self._email = email
        self._name = name

    def exchange_code(self, config, *, code, redirect_uri, client_id, client_secret, code_verifier=""):
        return TokenResponse(access_token="g-access", refresh_token="g-refresh", expires_in=3600,
                             raw={"email": self._email, "name": self._name, "sub": "g-123"})

    def refresh(self, config, *, refresh_token, client_id, client_secret):
        return TokenResponse(access_token="g-access", raw={})


def _client(email="tester@gmail.com") -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=_FakeGoogleExchanger(email))))


def _begin(client: TestClient) -> str:
    """Start login; return the `state` the backend stashed (from the Google redirect)."""
    r = client.get("/api/v1/auth/google/login", follow_redirects=False)
    assert r.status_code == 302
    loc = r.headers["location"]
    assert loc.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    q = parse_qs(urlparse(loc).query)
    assert q["scope"][0] == "openid email profile"          # login-only scopes, not Gmail
    assert q["redirect_uri"][0].endswith("/api/v1/auth/google/callback")
    return q["state"][0]


def test_google_login_issues_session_and_creates_user():
    client = _client("newgrad@gmail.com")
    st = _begin(client)
    r = client.get(f"/api/v1/auth/google/callback?code=abc&state={st}", follow_redirects=False)
    assert r.status_code == 200
    tok = r.json()
    assert tok["access_token"] and tok["refresh_token"]
    # the issued token works and the account now exists
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert client.get("/api/v1/interview/saved-answers", headers=h).status_code == 200


def test_google_login_is_idempotent_by_email():
    client = _client("repeat@gmail.com")
    tok1 = client.get(f"/api/v1/auth/google/callback?code=a&state={_begin(client)}",
                      follow_redirects=False).json()
    tok2 = client.get(f"/api/v1/auth/google/callback?code=b&state={_begin(client)}",
                      follow_redirects=False).json()
    # same email → same user (both tokens resolve to one account; no duplicate created)
    import jwt as _jwt
    s1 = _jwt.decode(tok1["access_token"], options={"verify_signature": False})["sub"]
    s2 = _jwt.decode(tok2["access_token"], options={"verify_signature": False})["sub"]
    assert s1 == s2


def test_google_callback_rejects_bad_state():
    client = _client()
    r = client.get("/api/v1/auth/google/callback?code=abc&state=not-a-real-state",
                   follow_redirects=False)
    assert r.status_code == 400  # no login_success_redirect configured → 400


def test_google_callback_rejects_provider_error():
    client = _client()
    st = _begin(client)
    r = client.get(f"/api/v1/auth/google/callback?error=access_denied&state={st}",
                   follow_redirects=False)
    assert r.status_code == 400


def test_google_login_redirects_to_frontend_with_tokens_when_configured():
    from jobsearch.config import Settings
    settings = Settings(login_success_redirect="https://frontend.example/auth/callback")
    app = create_app(state=AppState(exchanger=_FakeGoogleExchanger("x@gmail.com"), settings=settings))
    client = TestClient(app)
    st = _begin(client)
    r = client.get(f"/api/v1/auth/google/callback?code=abc&state={st}", follow_redirects=False)
    assert r.status_code == 302
    loc = r.headers["location"]
    assert loc.startswith("https://frontend.example/auth/callback#")
    assert "access_token=" in loc and "refresh_token=" in loc
