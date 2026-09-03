"""Screener-answer memory — normalize, learn, fuzzy-recall, and the API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.screener import ScreenerMemory, infer_kind, normalize


# --- normalization / kind ---------------------------------------------------
def test_normalize_and_kind():
    assert normalize("How many years of Security and Investigations experience do you currently have?") \
        == normalize("Years of security & investigations experience?")
    assert infer_kind("yes") == "boolean"
    assert infer_kind("15") == "numeric"
    assert infer_kind("New York") == "text"


# --- engine: learn + recall -------------------------------------------------
def test_learn_and_exact_recall():
    m = ScreenerMemory()
    m.learn("u1", "Do you have a valid driver's license?", "Yes")
    hit = m.suggest("u1", "Do you have a valid driver's license?")
    assert hit and hit["answer"] == "Yes" and hit["kind"] == "boolean" and hit["confidence"] == 1.0


def test_fuzzy_recall_reworded_question():
    m = ScreenerMemory()
    m.learn("u1", "How many years of Security and Investigations experience do you currently have?", "15")
    # a shorter rewording still resolves to the same saved answer
    hit = m.suggest("u1", "How many years of security experience do you have?")
    assert hit and hit["answer"] == "15" and hit["kind"] == "numeric"
    assert hit["confidence"] >= 0.6


def test_unknown_question_returns_none():
    m = ScreenerMemory()
    m.learn("u1", "Do you have a driver's license?", "Yes")
    assert m.suggest("u1", "What is your expected salary?") is None


def test_learn_upserts_not_duplicates():
    m = ScreenerMemory()
    m.learn("u1", "Are you authorized to work in the US?", "Yes")
    m.learn("u1", "Are you authorized to work in the US?", "No")  # changed answer
    saved = m.list_for("u1")
    assert len(saved) == 1 and saved[0].answer == "No"


def test_suggest_many_mixed():
    m = ScreenerMemory()
    m.learn("u1", "Do you have a valid driver's license?", "Yes")
    rows = m.suggest_many("u1", [
        "Do you have a valid driver license?",   # known (fuzzy)
        "How many years of Java experience?",    # unknown
    ])
    assert rows[0]["answer"] == "Yes"
    assert rows[1]["answer"] is None


# --- the real flow from the live LinkedIn Easy-Apply walk -------------------
def test_learns_then_autofills_next_application():
    m = ScreenerMemory()
    # First application: user answers two screeners → we learn them.
    m.learn_many("u1", [
        {"question": "Do you have a valid driver's license?", "answer": "Yes"},
        {"question": "How many years of Security and Investigations experience do you currently have?", "answer": "15"},
    ])
    # Next application asks the same things (slightly reworded) → both auto-fill.
    res = m.suggest_many("u1", [
        "Do you have a valid driver's license?",
        "Years of security and investigations experience?",
    ])
    assert res[0]["answer"] == "Yes" and res[1]["answer"] == "15"


# --- API --------------------------------------------------------------------
def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="scr@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "S"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_learn_suggest_flow():
    client = _client()
    h = _auth(client)
    # learn one
    r = client.post("/api/v1/auto-apply/screener/answers", headers=h,
                    json={"question": "Do you have a valid driver's license?", "answer": "Yes"})
    assert r.status_code == 201 and r.json()["kind"] == "boolean"
    # batch learn
    client.post("/api/v1/auto-apply/screener/answers/batch", headers=h, json={"answers": [
        {"question": "How many years of Security and Investigations experience do you currently have?", "answer": "15"},
        {"question": "Are you authorized to work in the US?", "answer": "Yes"},
    ]})
    # suggest for a new form (reworded)
    s = client.post("/api/v1/auto-apply/screener/suggest", headers=h, json={"questions": [
        "Do you have a valid driver license?",
        "Years of security experience?",
        "What is your desired salary?",  # unknown
    ]}).json()
    assert s["filled"] == 2 and s["unknown"] == ["What is your desired salary?"]
    by_q = {a["question"]: a for a in s["answers"]}
    assert by_q["Do you have a valid driver license?"]["answer"] == "Yes"
    # list
    assert len(client.get("/api/v1/auto-apply/screener/answers", headers=h).json()) == 3


def test_api_update_and_delete():
    client = _client()
    h = _auth(client)
    a = client.post("/api/v1/auto-apply/screener/answers", headers=h,
                    json={"question": "Expected salary?", "answer": "120000"}).json()
    upd = client.put(f"/api/v1/auto-apply/screener/answers/{a['id']}", headers=h, json={"answer": "130000"})
    assert upd.status_code == 200 and upd.json()["answer"] == "130000"
    assert client.delete(f"/api/v1/auto-apply/screener/answers/{a['id']}", headers=h).status_code == 204
    assert client.get("/api/v1/auto-apply/screener/answers", headers=h).json() == []


def test_api_learn_requires_answer_and_auth_owner():
    client = _client()
    assert client.get("/api/v1/auto-apply/screener/answers").status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    r = client.post("/api/v1/auto-apply/screener/answers", headers=ha, json={"question": "Q?", "answer": "  "})
    assert r.status_code == 400  # blank answer
    a = client.post("/api/v1/auto-apply/screener/answers", headers=ha,
                    json={"question": "Only A's question?", "answer": "x"}).json()
    assert client.get("/api/v1/auto-apply/screener/answers", headers=hb).json() == []
    assert client.delete(f"/api/v1/auto-apply/screener/answers/{a['id']}", headers=hb).status_code == 404
