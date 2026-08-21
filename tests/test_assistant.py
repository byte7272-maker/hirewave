"""Permissioned automation assistant — consent gate, form-fill guardrails, audit."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import AssistantEngine, FormField, FormFillEngine
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import User, UserProfile
from jobsearch.models.user import JobPreferences, SalaryRange


def _user() -> User:
    return User(email="ada@x.com", full_name="Ada Lovelace", phone="555-1234", location="London")


def _profile() -> UserProfile:
    return UserProfile(user_id="u1", headline="Staff Engineer", skills=["Python", "Go"],
                       preferences=JobPreferences(salary_range=SalaryRange(currency="USD", minimum=180000, maximum=220000)))


# --- form-fill guardrails ---------------------------------------------------
def test_credential_fields_are_never_filled():
    plan = FormFillEngine().plan(_user(), _profile(), [
        FormField("pw", "Create an account password", "password"),
        FormField("ssn", "SSN for background check", "text"),
        FormField("card", "Credit card number", "text"),
    ])
    assert all(e.status == "blocked" and e.value == "" for e in plan.entries)
    assert plan.blocked == 3


def test_factual_fields_filled_from_profile_only():
    plan = FormFillEngine().plan(_user(), _profile(), [
        FormField("name", "Full name"),
        FormField("email", "Email", "email"),
        FormField("loc", "City / Location"),
        FormField("skills", "Key skills"),
        FormField("salary", "Salary expectation"),
    ])
    vals = {e.field: e.value for e in plan.entries}
    assert vals["name"] == "Ada Lovelace"
    assert vals["email"] == "ada@x.com"
    assert vals["loc"] == "London"
    assert vals["skills"] == "Python, Go"
    assert "180000" in vals["salary"]
    assert plan.filled == 5


def test_unknown_fields_flagged_not_fabricated():
    plan = FormFillEngine().plan(_user(), _profile(), [
        FormField("yrs", "Years of experience", "number"),
        FormField("auth", "Are you authorized to work here?", "select"),
        FormField("li", "LinkedIn URL", "url"),
    ])
    assert all(e.status == "needs_input" and e.value == "" for e in plan.entries)


# --- consent + audit --------------------------------------------------------
def test_consent_defaults_off_and_validates_scopes():
    eng = AssistantEngine()
    assert eng.has("u1", "form_autofill") is False
    eng.set_consent("u1", ["form_autofill", "not_a_real_scope"])
    con = eng.get_consent("u1")
    assert con.scopes == ["form_autofill"]  # invalid scope dropped
    assert eng.has("u1", "form_autofill") is True


def test_autofill_records_audit_action():
    eng = AssistantEngine()
    user = _user()
    eng.autofill(user, _profile(), [FormField("name", "Full name"), FormField("pw", "Password", "password")], job_id="job_1")
    logged = eng.actions_for(user.id)
    assert logged and logged[0].kind == "autofill" and logged[0].job_id == "job_1"
    assert "refused" in logged[0].detail


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "Ada Lovelace", "location": "London"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _job(client, h) -> str:
    client.post("/api/v1/job-search/run", headers=h, json={"role": "Backend Engineer", "remote": True})
    return client.get("/api/v1/jobs/matches", headers=h).json()[0]["job_id"]


def test_api_autofill_requires_permission():
    client = _client()
    h = _auth(client)
    jid = _job(client, h)
    assert client.get("/api/v1/assistant/consent", headers=h).json()["granted"] == []
    assert client.post(f"/api/v1/assistant/autofill/{jid}", headers=h, json={}).status_code == 403
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["form_autofill"]})
    assert client.post(f"/api/v1/assistant/autofill/{jid}", headers=h, json={}).status_code == 200


def test_api_autofill_plan_refuses_credentials_and_logs():
    client = _client()
    h = _auth(client)
    jid = _job(client, h)
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["form_autofill"]})
    plan = client.post(f"/api/v1/assistant/autofill/{jid}", headers=h, json={}).json()
    assert plan["blocked"] >= 2 and plan["filled"] >= 3
    cred = [e for e in plan["entries"] if e["status"] == "blocked"]
    assert all(e["value"] == "" for e in cred)
    assert any("password" in e["label"].lower() for e in cred)
    actions = client.get("/api/v1/assistant/actions", headers=h).json()
    assert actions and actions[0]["kind"] == "autofill"


def test_api_consent_available_scopes_listed():
    client = _client()
    h = _auth(client)
    out = client.get("/api/v1/assistant/consent", headers=h).json()
    assert "form_autofill" in out["available"]


def test_api_assistant_requires_auth():
    client = _client()
    assert client.get("/api/v1/assistant/consent").status_code == 401
