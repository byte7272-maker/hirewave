"""GET /integrations/email-sources: accurate per-account stats (used/cap), job boards
excluded, multiple Gmail accounts supported."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import Provider


def _app():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="e@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "E"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_email_sources_counts_mail_accounts_only_and_reports_real_cap():
    st, c = _app()
    h = _auth(c)
    uid = st.user_by_email("e@x.com").id
    # one Gmail + a LinkedIn (job board) connected
    st.integration.tokens.save(user_id=uid, provider=Provider.GMAIL, access_token="t", account_email="a@gmail.com")
    st.integration.tokens.save(user_id=uid, provider=Provider.LINKEDIN, access_token="t", account_email="")
    body = c.get("/api/v1/integrations/email-sources", headers=h).json()
    assert body["used"] == 1                       # Gmail counts; LinkedIn does NOT
    assert body["cap"] == 5                         # the real limit, not a hardcoded 4
    assert body["remaining"] == 4 and body["can_add"] is True
    providers = {s["provider"] for s in body["sources"]}
    assert providers == {"gmail"}                   # only mail accounts listed


def test_supports_a_second_gmail_account():
    st, c = _app()
    h = _auth(c)
    uid = st.user_by_email("e@x.com").id
    st.integration.tokens.save(user_id=uid, provider=Provider.GMAIL, access_token="t", account_email="a@gmail.com")
    st.integration.tokens.save(user_id=uid, provider=Provider.GMAIL, access_token="t", account_email="b@gmail.com")
    body = c.get("/api/v1/integrations/email-sources", headers=h).json()
    emails = sorted(s["account_email"] for s in body["sources"])
    assert emails == ["a@gmail.com", "b@gmail.com"]  # two Gmail accounts, both listed
    assert body["used"] == 2 and body["can_add"] is True
    assert body["multiple_per_provider"] is True


def test_empty_when_nothing_connected():
    st, c = _app()
    h = _auth(c)
    body = c.get("/api/v1/integrations/email-sources", headers=h).json()
    assert body["used"] == 0 and body["sources"] == [] and body["can_add"] is True
