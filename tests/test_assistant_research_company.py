"""The assistant's 'research this company' action: it must DO something useful —
narrate a summary and hand over lookup links — and, since web research is off by
default, offer to turn it on (a soft prompt, not a hard 403) rather than failing."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant import company_lookup
from jobsearch.engines.integration import MockTokenExchanger


def test_lookup_links_cover_the_majors():
    links = company_lookup.lookup_links("Bryan Cave Leighton Paisner LLP")
    labels = {l["label"] for l in links}
    assert {"LinkedIn", "Glassdoor reviews", "Recent news"} <= labels
    assert all(l["url"].startswith("https://") for l in links)
    assert company_lookup.lookup_links("") == []  # no company → no links


def test_narrate_speaks_with_and_without_results():
    with_results = company_lookup.narrate("Acme", [{"title": "Acme Corp — Careers", "url": "https://acme.co"}])
    assert "Acme" in with_results and "?" in with_results
    without = company_lookup.narrate("Acme", [])
    assert "Acme" in without and without.strip()


def test_research_company_payload_without_search_provider_still_narrates_and_links():
    out = company_lookup.research_company("Globex", settings=Settings())
    assert out["reply"].strip()
    assert out["links"] and out["use_client"] is True  # no Google key → client may search
    assert out["results"] == []


# --- endpoint: soft permission gate -----------------------------------------
def _client():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="research@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "R"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _uid(state, email):
    return next(u.id for u in state.users.all() if u.email == email)


def test_research_company_prompts_to_enable_when_scope_off():
    state, c = _client()
    h = _auth(c)
    r = c.get("/api/v1/assistant/research/company", params={"company": "Acme"}, headers=h)
    assert r.status_code == 200  # soft gate, NOT 403
    body = r.json()
    assert body["needs_permission"] is True
    assert body["scope"] == "web_research"
    assert body["permission_prompt"].strip()
    assert body["reply"].strip()
    assert body["links"]  # never a dead end


def test_research_company_runs_when_scope_granted():
    state, c = _client()
    h = _auth(c)
    state.assistant.set_consent(_uid(state, "research@x.com"), ["web_research"])
    body = c.get("/api/v1/assistant/research/company", params={"company": "Acme"}, headers=h).json()
    assert body["needs_permission"] is False
    assert body["reply"].strip()
    assert body["links"]


def test_research_company_requires_auth():
    _, c = _client()
    assert c.get("/api/v1/assistant/research/company", params={"company": "Acme"}).status_code == 401
