"""Gmail fetch cap is configurable (was hard-capped at 10) + auto-apply rule
suggested-criteria (pre-fill from ingested roles / preferences)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _auth(client: TestClient, email="u@x.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_gmail_max_messages_defaults_above_10():
    assert Settings().gmail_max_messages == 50  # was effectively hard-capped at 10


class _RecordingFetcher:
    live = False  # skip token lookup in the scan path

    def __init__(self):
        self.last_max = None

    def fetch(self, *, access_token="", max_messages=10):
        self.last_max = max_messages
        return []


def test_scan_passes_configured_cap_not_hardcoded_10():
    state = AppState(exchanger=MockTokenExchanger())
    spy = _RecordingFetcher()
    state.gmail_fetcher = spy
    client = TestClient(create_app(state=state))
    h = _auth(client)
    r = client.post("/api/v1/inbox/scan?source=gmail", headers=h)
    assert r.status_code == 200
    assert spy.last_max == 50  # the configured cap flowed through, not the old 10


def test_suggested_criteria_prefills_from_ingested_roles():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [
        {"source_platform": "linkedin", "title": "IT Service Delivery Manager", "company": "Acme", "location": "Remote"},
        {"source_platform": "indeed", "title": "IT Operations Manager", "company": "Globex", "location": "NYC"},
    ]})
    body = client.get("/api/v1/auto-apply/suggested-criteria", headers=h).json()
    assert body["criteria"]["title_keywords"]          # not blank — derived from titles/categories
    assert body["criteria"]["min_fit_score"] == 60
    assert set(body["criteria"]["sources"]) & {"linkedin", "indeed"}
    assert body["suggested"]["max_submits"] > 10        # higher default than the old 10
    assert body["basis"]["roles_ingested"] >= 2
