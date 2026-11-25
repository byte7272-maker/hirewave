"""Admin dashboard of external API dependencies: config + admin-known expiry/balance/cost,
with reminders for expiry / required-but-off / low funds."""

from __future__ import annotations

import json
from datetime import date, timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.dependencies import build_dependencies
from jobsearch.engines.integration import MockTokenExchanger

ADMIN = "s3cret-admin"
AUTH = {"X-Admin-Token": ADMIN}


def _app(**settings):
    s = Settings(admin_token=ADMIN, **settings)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def test_dependencies_requires_admin_token():
    _, c = _app()
    assert c.get("/api/v1/admin/dependencies").status_code == 403
    assert c.get("/api/v1/admin/dependencies", headers=AUTH).status_code == 200


def test_dependencies_lists_core_services_and_config_status():
    payload = build_dependencies(Settings(anthropic_api_key="sk-x", llm_provider="anthropic"))
    ids = {d["id"] for d in payload["dependencies"]}
    assert {"anthropic", "openai", "brave_search", "database", "gmail"} <= ids
    anthropic = next(d for d in payload["dependencies"] if d["id"] == "anthropic")
    assert anthropic["configured"] is True and anthropic["model"]
    # A required dep that's unconfigured shows up as a reminder.
    assert any(r["id"] == "openai" for r in payload["reminders"])  # no OpenAI key here


def test_admin_metadata_merges_and_reminds_on_expiry():
    soon = (date.today() + timedelta(days=5)).isoformat()
    meta = {"anthropic": {"expiry": soon, "balance": "$42.10", "monthly_cost": "$20",
                          "notes": "team key"}}
    s = Settings(anthropic_api_key="sk-x", llm_provider="anthropic",
                 openai_api_key="sk-o", embedding_provider="openai",
                 database_url="postgres://x",
                 dependency_meta_raw=json.dumps(meta))
    payload = build_dependencies(s)
    anthropic = next(d for d in payload["dependencies"] if d["id"] == "anthropic")
    assert anthropic["balance"] == "$42.10" and anthropic["monthly_cost"] == "$20"
    assert anthropic["days_to_expiry"] == 5 and anthropic["notes"] == "team key"
    # Expiring within the window → a reminder, most-urgent first.
    assert payload["reminders"] and payload["reminders"][0]["id"] == "anthropic"
    assert any("expires in 5d" in r for r in payload["reminders"][0]["reasons"])


def test_low_balance_and_expired_raise_reminders():
    meta = {"brave_search": {"balance": "low"},
            "anthropic": {"expiry": (date.today() - timedelta(days=2)).isoformat()}}
    s = Settings(anthropic_api_key="sk-x", llm_provider="anthropic",
                 openai_api_key="sk-o", embedding_provider="openai",
                 database_url="postgres://x", brave_search_key="bk",
                 dependency_meta_raw=json.dumps(meta))
    payload = build_dependencies(s)
    by_id = {r["id"]: r for r in payload["reminders"]}
    assert "brave_search" in by_id and any("balance low" in x for x in by_id["brave_search"]["reasons"])
    assert "anthropic" in by_id and any("expired" in x for x in by_id["anthropic"]["reasons"])


def test_malformed_meta_never_breaks():
    s = Settings(dependency_meta_raw="{not json")
    payload = build_dependencies(s)  # must not raise
    assert payload["count"] >= 1
