"""Assistant web-research search provider: Google CSE (offline, injected fetch),
provider selection, and the consent-gated /assistant/research/search endpoint."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant import web_search
from jobsearch.engines.integration import MockTokenExchanger

_CSE_BODY = json.dumps({
    "items": [
        {"title": "Acme Robotics — About", "link": "https://acme.co/about", "snippet": "Acme builds robots."},
        {"title": "Acme leadership", "link": "https://acme.co/team", "snippet": "Our team."},
        {"title": "ignored (not http)", "link": "ftp://x", "snippet": "nope"},
    ]
})


def _fetch_ok(url, timeout):
    assert "customsearch/v1" in url and "key=K" in url and "cx=CX" in url
    return 200, _CSE_BODY


# --- provider (pure) --------------------------------------------------------
def test_provider_selection():
    assert Settings().research_search_provider() == "duckduckgo"               # no key
    assert Settings(google_cse_key="K", google_cse_cx="CX").research_search_provider() == "google"


def test_google_cse_parses_results_offline():
    r = web_search.google_cse_search("Acme", key="K", cx="CX", limit=6, fetch=_fetch_ok)
    assert r.provider == "google"
    urls = [x.url for x in r.results]
    assert urls == ["https://acme.co/about", "https://acme.co/team"]  # non-http dropped
    assert r.results[0].title == "Acme Robotics — About"


def test_google_cse_transport_failure_is_safe():
    r = web_search.google_cse_search("Acme", key="K", cx="CX", fetch=lambda u, t: (0, ""))
    assert r.provider == "google" and r.results == [] and r.error


def test_search_uses_google_when_configured_else_client_fallback():
    s_google = Settings(google_cse_key="K", google_cse_cx="CX")
    r = web_search.search("Acme", settings=s_google, fetch=_fetch_ok)
    assert r.provider == "google" and r.results
    # no key -> tell the client to search on the user's connection
    r2 = web_search.search("Acme", settings=Settings())
    assert r2.provider == "duckduckgo" and r2.use_client and r2.results == []


# --- endpoint (consent-gated) ----------------------------------------------
def _app(**kw):
    state = AppState(settings=Settings(**kw), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="s@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "S"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_search_endpoint_requires_consent():
    _, c = _app()
    h = _auth(c)
    r = c.post("/api/v1/assistant/research/search", headers=h, json={"query": "Acme"})
    assert r.status_code == 403


def test_search_endpoint_without_key_tells_client_to_search():
    _, c = _app()
    h = _auth(c)
    c.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["web_research"]})
    r = c.post("/api/v1/assistant/research/search", headers=h, json={"query": "Acme"})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "duckduckgo" and body["use_client"] is True
