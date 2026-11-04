"""Admin account-type control: designate testers / trial / free (single + bulk)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger

ADMIN = "s3cret-admin"
AUTH = {"X-Admin-Token": ADMIN}


def _app():
    s = Settings(plan_limits_enforced=True, admin_token=ADMIN)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _register(c, email):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})


def test_account_type_endpoints_require_admin_token():
    _, c = _app()
    assert c.post("/api/v1/admin/accounts/type", json={"type": "tester", "email": "a@b.com"}).status_code == 403
    assert c.post("/api/v1/admin/accounts/bulk-type", json={"type": "free"}).status_code == 403
    assert c.get("/api/v1/admin/accounts").status_code == 403


def test_set_one_account_to_tester():
    state, c = _app()
    _register(c, "a@example.com")
    # a fresh non-gmail account is on the trial until designated
    r = c.post("/api/v1/admin/accounts/type", headers=AUTH, json={"type": "tester", "email": "a@example.com"})
    assert r.status_code == 200, r.text
    assert r.json()["effective_type"] == "tester" and r.json()["stored_type"] == "tester"
    assert state.user_by_email("a@example.com").plan == "tester"


def test_auto_clears_the_override():
    state, c = _app()
    _register(c, "a@example.com")
    c.post("/api/v1/admin/accounts/type", headers=AUTH, json={"type": "free", "email": "a@example.com"})
    assert state.user_by_email("a@example.com").plan == "free"
    r = c.post("/api/v1/admin/accounts/type", headers=AUTH, json={"type": "auto", "email": "a@example.com"})
    assert r.status_code == 200 and state.user_by_email("a@example.com").plan == ""


def test_unknown_account_is_404():
    _, c = _app()
    assert c.post("/api/v1/admin/accounts/type", headers=AUTH,
                  json={"type": "tester", "email": "nobody@example.com"}).status_code == 404


def test_bulk_set_by_domain():
    state, c = _app()
    _register(c, "a@acme.com")
    _register(c, "b@acme.com")
    _register(c, "c@other.com")
    r = c.post("/api/v1/admin/accounts/bulk-type", headers=AUTH, json={"type": "tester", "domain": "acme.com"})
    assert r.status_code == 200 and r.json()["updated"] == 2
    assert state.user_by_email("a@acme.com").plan == "tester"
    assert state.user_by_email("c@other.com").plan == ""  # untouched


def test_bulk_set_everyone_when_no_filter():
    state, c = _app()
    _register(c, "a@acme.com")
    _register(c, "b@other.com")
    r = c.post("/api/v1/admin/accounts/bulk-type", headers=AUTH, json={"type": "free"})
    assert r.json()["updated"] == 2
    assert state.user_by_email("a@acme.com").plan == "free"


def test_list_accounts_filtered_by_effective_type():
    _, c = _app()
    _register(c, "t@example.com")
    _register(c, "n@example.com")
    c.post("/api/v1/admin/accounts/type", headers=AUTH, json={"type": "tester", "email": "t@example.com"})
    testers = c.get("/api/v1/admin/accounts?effective_type=tester", headers=AUTH).json()
    emails = {row["email"] for row in testers}
    assert "t@example.com" in emails and "n@example.com" not in emails
