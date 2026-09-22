"""Beginner Getting-Started onboarding — derived status + stored marks."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="onb@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "Onb"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _steps(body):
    return {s["key"]: s for s in body["steps"]}


def test_fresh_user_all_incomplete():
    client = _client()
    h = _auth(client)
    b = client.get("/api/v1/onboarding", headers=h).json()
    assert b["dismissed"] is False
    assert b["core_total"] == 4 and b["core_completed"] == 0 and b["percent"] == 0
    steps = _steps(b)
    assert set(steps) == {"profile", "find_jobs", "apply", "interview", "highlights", "auto_apply", "security"}
    assert steps["profile"]["core"] is True and steps["highlights"]["core"] is False
    assert all(not s["done"] for s in b["steps"])


def test_profile_detected_from_resume():
    client = _client()
    h = _auth(client)
    # upload a résumé → profile step auto-detects done
    client.post(
        "/api/v1/resumes/upload",
        headers=h,
        files={"file": ("cv.md", b"# CV\nPython, FastAPI", "text/markdown")},
    )
    b = client.get("/api/v1/onboarding", headers=h).json()
    assert _steps(b)["profile"]["done"] is True
    assert _steps(b)["profile"]["detected"] is True
    assert b["core_completed"] == 1 and b["percent"] == 25


def test_interview_detected_from_mock_session():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/users/me", headers=h, json={"skills": ["Python"]})
    client.post("/api/v1/interview/mock/start", headers=h, json={"difficulty": "easy", "max_questions": 2})
    b = client.get("/api/v1/onboarding", headers=h).json()
    assert _steps(b)["interview"]["done"] is True


def test_highlight_detected_from_experience():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/experience", headers=h, json={"content": "Led the billing migration, cutting latency 40%."})
    b = client.get("/api/v1/onboarding", headers=h).json()
    assert _steps(b)["highlights"]["done"] is True


def test_mark_step_completed_overrides_detection():
    client = _client()
    h = _auth(client)
    r = client.put("/api/v1/onboarding/find_jobs", headers=h, json={"status": "completed"})
    assert r.status_code == 200
    b = r.json()
    s = _steps(b)["find_jobs"]
    assert s["done"] is True and s["detected"] is False and s["marked"] == "completed"
    assert b["core_completed"] == 1


def test_mark_step_dismissed_not_done():
    client = _client()
    h = _auth(client)
    b = client.put("/api/v1/onboarding/apply", headers=h, json={"status": "dismissed"}).json()
    s = _steps(b)["apply"]
    assert s["marked"] == "dismissed" and s["done"] is False


def test_invalid_step_and_status():
    client = _client()
    h = _auth(client)
    assert client.put("/api/v1/onboarding/nope", headers=h, json={"status": "completed"}).status_code == 404
    assert client.put("/api/v1/onboarding/apply", headers=h, json={"status": "bogus"}).status_code == 400


def test_dismiss_hub_persists():
    client = _client()
    h = _auth(client)
    b = client.put("/api/v1/onboarding", headers=h, json={"dismissed": True}).json()
    assert b["dismissed"] is True
    assert client.get("/api/v1/onboarding", headers=h).json()["dismissed"] is True
    # restore
    assert client.put("/api/v1/onboarding", headers=h, json={"dismissed": False}).json()["dismissed"] is False


def test_resume_step_defaults_to_first_incomplete():
    client = _client()
    h = _auth(client)
    b = client.get("/api/v1/onboarding", headers=h).json()
    # Nothing opened yet, nothing done -> resume at the first core step.
    assert b["current_step"] == ""
    assert b["resume_step"] == "profile"


def test_started_pointer_is_remembered():
    client = _client()
    h = _auth(client)
    # Opening the "apply" step records it as the current step...
    b = client.put("/api/v1/onboarding/apply", headers=h, json={"status": "started"}).json()
    assert b["current_step"] == "apply" and b["resume_step"] == "apply"
    # ...and it survives a fresh fetch (persisted).
    assert client.get("/api/v1/onboarding", headers=h).json()["resume_step"] == "apply"


def test_resume_advances_past_the_opened_step_once_done():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/onboarding/apply", headers=h, json={"status": "started"})
    # Once that step is done, the wizard should resume at the next not-done step,
    # not sit on the completed one.
    b = client.put("/api/v1/onboarding/apply", headers=h, json={"status": "completed"}).json()
    assert b["current_step"] == "apply"  # raw pointer unchanged
    assert b["resume_step"] != "apply" and b["resume_step"] in {"profile", "find_jobs", "interview"}


def test_completed_status_does_not_move_the_pointer():
    client = _client()
    h = _auth(client)
    # Marking done without opening it shouldn't set the "last opened" pointer.
    b = client.put("/api/v1/onboarding/find_jobs", headers=h, json={"status": "completed"}).json()
    assert b["current_step"] == ""


def test_requires_auth():
    client = _client()
    assert client.get("/api/v1/onboarding").status_code == 401


def test_progress_is_owner_scoped():
    client = _client()
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    client.put("/api/v1/onboarding/profile", headers=ha, json={"status": "completed"})
    # B is unaffected
    b = client.get("/api/v1/onboarding", headers=hb).json()
    assert _steps(b)["profile"]["marked"] is None and _steps(b)["profile"]["done"] is False
