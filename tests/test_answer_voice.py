"""The answer-readout voice (for suggested / 'ideal' answers) is simple to pick:
male/female + a few styles, saved per user, separate from the interviewer personas."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _client(**settings_kw) -> TestClient:
    kw = {"exchanger": MockTokenExchanger()}
    if settings_kw:
        kw["settings"] = Settings(**settings_kw)
    return TestClient(create_app(state=AppState(**kw)))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "v@x.com", "password": "supersecret", "full_name": "V"})
    tok = client.post("/api/v1/auth/login", json={"email": "v@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_catalog_lists_simple_gendered_voices():
    client = _client(tts_provider="openai", tts_api_key="k")
    h = _auth(client)
    cat = client.get("/api/v1/interview/answer-voice/catalog", headers=h).json()
    assert cat["tts"] is True
    genders = {v["gender"] for v in cat["voices"]}
    assert {"male", "female"} <= genders
    assert all("label" in v and "voice_id" in v for v in cat["voices"])


def test_default_then_pick_by_gender():
    client = _client(tts_provider="openai", tts_api_key="k")
    h = _auth(client)
    # A sensible default exists even before the user picks.
    d = client.get("/api/v1/interview/answer-voice", headers=h).json()
    assert d["persona_id"] == "answer" and d["voice_id"]

    # Simplest pick: just a gender → a good neural voice, persisted.
    female = client.put("/api/v1/interview/answer-voice", headers=h, json={"gender": "female"}).json()
    assert female["source"] == "server" and female["voice_id"] in ("nova", "shimmer", "fable")
    male = client.put("/api/v1/interview/answer-voice", headers=h, json={"gender": "male"}).json()
    assert male["voice_id"] in ("echo", "onyx")

    # Persists across reads.
    again = client.get("/api/v1/interview/answer-voice", headers=h).json()
    assert again["voice_id"] == male["voice_id"]


def test_pick_exact_voice_and_browser_fallback():
    client = _client(tts_provider="openai", tts_api_key="k")
    h = _auth(client)
    exact = client.put("/api/v1/interview/answer-voice", headers=h, json={"voice_id": "shimmer"}).json()
    assert exact["voice_id"] == "shimmer" and exact["source"] == "server"
    # A browser voice choice is honored too.
    br = client.put("/api/v1/interview/answer-voice", headers=h,
                    json={"source": "browser", "voice_uri": "Google US English", "rate": 1.1}).json()
    assert br["source"] == "browser" and br["voice_uri"] == "Google US English"


def test_answer_voice_requires_auth():
    client = _client()
    assert client.get("/api/v1/interview/answer-voice").status_code == 401
