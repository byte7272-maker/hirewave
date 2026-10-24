"""Interview answer suggestions + a saveable personal answer library."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str = "cand@x.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "Cand"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_suggest_answer_returns_grounded_reply_without_a_session():
    client = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/suggest-answer",
        headers=h,
        json={"question": "Tell me about a time you led a project."},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["answer"].strip()          # a transcribe-able suggested reply
    assert body["category"] == "behavioral"  # "time you..." → behavioral
    assert body["answer_seconds"] > 0
    assert "tips" in body


def test_suggest_answer_grounds_in_resume_without_an_explicit_id():
    """Even when the caller passes no resume_id, the answer should be grounded in the
    user's résumé (not a generic bracketed placeholder)."""
    client = _client()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h, files={"file": (
        "cv.md",
        b"# Jordan\n## Experience\n- Led the ACME-9000 migration at Globex, cutting costs 40%",
        "text/markdown")})
    body = client.post("/api/v1/interview/suggest-answer", headers=h,
                       json={"question": "Tell me about a project you led."}).json()
    ans = body["answer"]
    assert ans.strip()
    # The offline coach echoes the résumé context, so grounded content appears and
    # there are no unfilled bracket placeholders.
    assert "[" not in ans and "]" not in ans


def test_refine_answer_applies_instruction_and_points():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h, files={"file": (
        "cv.md", b"# Me\n## Experience\n- Led the ACME migration at Globex, saved 40%", "text/markdown")})
    r = client.post("/api/v1/interview/refine-answer", headers=h, json={
        "question": "Tell me about a project you led.",
        "answer": "I led a project once.",
        "instruction": "Make it concrete and emphasize the cost savings.",
        "points": ["the 40% cost savings", "my ownership"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["answer"].strip() and "[" not in body["answer"]
    assert body["answer_seconds"] > 0


def test_refine_answer_requires_question_and_instruction():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/interview/refine-answer", headers=h,
                       json={"question": "Q", "answer": "a", "instruction": " "}).status_code == 400


def test_suggest_answer_requires_a_question():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/interview/suggest-answer", headers=h,
                       json={"question": "  "}).status_code == 400


def test_save_list_and_delete_answers():
    client = _client()
    h = _auth(client)
    # save one (as if the user kept a suggestion)
    saved = client.post(
        "/api/v1/interview/saved-answers",
        headers=h,
        json={"question": "Why do you want this role?", "answer": "Because I value impact...",
              "tips": "Connect mission to motivation.", "source": "suggested"},
    )
    assert saved.status_code == 201
    aid = saved.json()["id"]
    assert saved.json()["category"] == "motivation"  # inferred from "why ... role"

    listed = client.get("/api/v1/interview/saved-answers", headers=h).json()
    assert [a["id"] for a in listed] == [aid]
    assert listed[0]["answer"].startswith("Because I value")

    assert client.delete(f"/api/v1/interview/saved-answers/{aid}", headers=h).status_code == 204
    assert client.get("/api/v1/interview/saved-answers", headers=h).json() == []


def test_saved_answers_are_owner_scoped():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    aid = client.post("/api/v1/interview/saved-answers", headers=a,
                      json={"question": "Q?", "answer": "A."}).json()["id"]
    # b cannot see or delete a's answer
    assert client.get("/api/v1/interview/saved-answers", headers=b).json() == []
    assert client.delete(f"/api/v1/interview/saved-answers/{aid}", headers=b).status_code == 404


def test_save_requires_question_and_answer():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/interview/saved-answers", headers=h,
                       json={"question": "Q?", "answer": ""}).status_code == 400
