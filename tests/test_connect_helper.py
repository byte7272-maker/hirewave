"""The local capture helper (python -m jobsearch.connect)."""

from __future__ import annotations

import io
import urllib.error

import pytest
from fastapi.testclient import TestClient

from jobsearch import connect as C
from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def test_login_urls_cover_supported_sites():
    for site in ("linkedin", "indeed", "glassdoor", "greenhouse", "workday"):
        assert site in C._LOGIN_URLS and C._LOGIN_URLS[site].startswith("https://")


class _Resp:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_submit_completes_pairing_against_real_endpoint(monkeypatch):
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register", json={"email": "h@demo.com", "password": "supersecret12", "full_name": "H"})
    tok = client.post("/api/v1/auth/login", json={"email": "h@demo.com", "password": "supersecret12"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    code = client.post("/api/v1/auto-apply/sessions/connect-intent", headers=h, json={"provider": "linkedin"}).json()["code"]

    # Route the helper's urllib POST at the in-process app.
    def fake_urlopen(req, timeout=30):
        r = client.post(req.full_url, data=req.data, headers={"Content-Type": "application/json"})
        if r.status_code >= 400:
            raise urllib.error.HTTPError(req.full_url, r.status_code, "err", {}, io.BytesIO(r.content))
        return _Resp(r.content)

    monkeypatch.setattr(C.urllib.request, "urlopen", fake_urlopen)

    result = C.submit("http://testserver", code, "linkedin", '{"cookies":[]}', "me@x.com")
    assert result["status"] == "connected"
    # and the session now exists / the site is AI-accessible
    apps = {a["provider"]: a for a in client.get("/api/v1/integrations/connected-apps", headers=h).json()}
    assert apps["linkedin"]["authenticated"] is True and apps["linkedin"]["ai_access"] is True


def test_submit_http_error_becomes_systemexit(monkeypatch):
    def boom(req, timeout=30):
        raise urllib.error.HTTPError(req.full_url, 400, "bad", {}, io.BytesIO(b'{"detail":"invalid connect code"}'))

    monkeypatch.setattr(C.urllib.request, "urlopen", boom)
    with pytest.raises(SystemExit) as e:
        C.submit("http://x", "nope", "linkedin", "{}", "")
    assert "invalid connect code" in str(e.value)


def test_main_requires_a_code(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda *a: "")  # user enters nothing
    with pytest.raises(SystemExit) as e:
        C.main(["--provider", "linkedin"])
    assert "pairing code" in str(e.value).lower()
