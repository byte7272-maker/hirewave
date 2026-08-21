"""Live browser fill — orchestration, safety bailouts, credential exclusion."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant import (
    AssistantEngine,
    FormField,
    FormFillEngine,
    LiveFillEngine,
    MockBrowserDriver,
    build_browser_driver,
)
from jobsearch.engines.automation.browser import FillOutcome
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import User, UserProfile

_FIELDS = [
    FormField("full_name", "Full name"),
    FormField("email", "Email", "email"),
    FormField("account_password", "Create a password", "password"),
    FormField("years", "Years of experience", "number"),
]


def _user() -> User:
    return User(email="ada@x.com", full_name="Ada Lovelace", phone="555", location="London")


def _plan():
    return FormFillEngine().plan(_user(), UserProfile(user_id="u1", skills=["Python"]), _FIELDS)


class _CapturingDriver(MockBrowserDriver):
    """Records exactly what fields it was asked to fill."""

    def fill_application(self, fields):
        self.received = dict(fields)
        return FillOutcome(filled=list(fields.keys()))


class _RaisingDriver(MockBrowserDriver):
    def start(self):
        raise RuntimeError("browser crashed")


# --- orchestration ----------------------------------------------------------
def test_fill_then_pending_submit():
    r = LiveFillEngine().execute(_plan(), MockBrowserDriver(), url="https://x/1", submit=False)
    assert r.status == "filled_pending_submit"
    assert set(r.filled) == {"name", "email"}  # canonical keys, credentials excluded


def test_submit_finalizes():
    r = LiveFillEngine().execute(_plan(), MockBrowserDriver(), url="https://x/1", submit=True)
    assert r.status == "submitted" and r.confirmation == "mock-submitted"


def test_credential_value_never_reaches_the_browser():
    driver = _CapturingDriver()
    LiveFillEngine().execute(_plan(), driver, url="https://x/1", submit=True)
    # the password field is neither present nor its value passed to the driver
    assert "account_password" not in driver.received
    assert all("password" not in k.lower() for k in driver.received)
    assert set(driver.received) == {"name", "email"}


def test_safety_bailouts():
    eng = LiveFillEngine()
    assert eng.execute(_plan(), MockBrowserDriver(needs_login=True), url="https://x", submit=True).status == "needs_login"
    assert eng.execute(_plan(), MockBrowserDriver(captcha=True), url="https://x", submit=True).status == "captcha"
    assert eng.execute(_plan(), MockBrowserDriver(can_apply=False), url="https://x", submit=True).status == "no_apply_button"
    assert eng.execute(_plan(), MockBrowserDriver(), url="", submit=True).status == "no_url"
    assert eng.execute(_plan(), _RaisingDriver(), url="https://x", submit=True).status == "error"


def test_unknown_required_escalates():
    class _UnknownDriver(MockBrowserDriver):
        def fill_application(self, fields):
            return FillOutcome(filled=list(fields.keys()), unknown_required=["visa_status"])

    r = LiveFillEngine().execute(_plan(), _UnknownDriver(), url="https://x", submit=True)
    assert r.status == "needs_input" and "visa_status" in r.unknown_required


def test_build_driver_defaults_to_mock():
    driver, live = build_browser_driver(Settings(assistant_browser="mock"))
    assert isinstance(driver, MockBrowserDriver) and live is False


def test_execute_records_audit():
    eng = AssistantEngine()
    user = _user()
    eng.execute_fill(user, _plan(), MockBrowserDriver(), url="https://x", submit=True, job_id="job_1")
    logged = eng.actions_for(user.id)
    assert logged and logged[0].kind == "submit" and logged[0].status == "completed"


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "Ada", "location": "London"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _job(client, h) -> str:
    client.post("/api/v1/job-search/run", headers=h, json={"role": "Backend Engineer", "remote": True})
    return client.get("/api/v1/jobs/matches", headers=h).json()[0]["job_id"]


def test_api_execute_permission_gates():
    client = _client()
    h = _auth(client)
    jid = _job(client, h)
    # no permission at all
    assert client.post(f"/api/v1/assistant/autofill/{jid}/execute", headers=h, json={"submit": False}).status_code == 403
    # form_autofill lets you fill but not submit
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["form_autofill"]})
    r = client.post(f"/api/v1/assistant/autofill/{jid}/execute", headers=h, json={"submit": False})
    assert r.status_code == 200 and r.json()["status"] == "filled_pending_submit"
    assert client.post(f"/api/v1/assistant/autofill/{jid}/execute", headers=h, json={"submit": True}).status_code == 403
    # granting submit_after_review allows submit
    client.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["form_autofill", "submit_after_review"]})
    done = client.post(f"/api/v1/assistant/autofill/{jid}/execute", headers=h, json={"submit": True}).json()
    assert done["status"] == "submitted" and done["live"] is False
    # audit shows the submit
    assert any(a["kind"] == "submit" for a in client.get("/api/v1/assistant/actions", headers=h).json())
