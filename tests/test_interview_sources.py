"""User-directed interview sources: persona library, question bank, media
providers, and the API surface that exposes them."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import (
    HttpSpeechProvider,
    MockInterviewTrainer,
    NullSpeechProvider,
    PersonaLibrary,
    QuestionBank,
    build_avatar_provider,
    build_speech_provider,
)
from jobsearch.models import InterviewerStyle, UserProfile

PERSONAS = [
    {"name": "Dana Cole", "role": "VP Engineering", "company": "Acme", "style": "skeptical",
     "gender": "female", "voice": "firm", "voice_id": "eleven:dana", "bio": "Runs the bar-raiser loop."},
    {"name": "Sam Rivera", "role": "Staff Engineer", "company": "Acme", "style": "technical",
     "gender": "male", "voice": "crisp", "voice_id": "openai:onyx"},
]
BANK = {
    "technical": [
        {"category": "technical", "question": "Design a rate limiter."},
        {"category": "experience", "question": "Toughest production incident you owned?"},
    ],
    "default": [{"category": "intro", "question": "Give me your two-minute story."}],
}


# --- persona library --------------------------------------------------------
def test_persona_library_resolves_by_style_and_id():
    lib = PersonaLibrary.from_records(PERSONAS)
    assert not lib.is_empty() and len(lib.all()) == 2
    # style match wins
    p = lib.resolve(style=InterviewerStyle.TECHNICAL, seed="seed")
    assert p is not None and p.style == InterviewerStyle.TECHNICAL and p.voice_id == "openai:onyx"
    # deterministic
    assert lib.resolve(style=InterviewerStyle.TECHNICAL, seed="seed").name == p.name


def test_persona_library_ignores_bad_records():
    lib = PersonaLibrary.from_records([{"role": "no name"}, {"name": "X", "role": "Y"}])
    assert len(lib.all()) == 1


def test_trainer_uses_persona_library():
    lib = PersonaLibrary.from_records(PERSONAS)
    trainer = MockInterviewTrainer(persona_library=lib)
    session = trainer.start_session(
        UserProfile(user_id="u1"), style=InterviewerStyle.SKEPTICAL, max_questions=3
    )
    assert session.persona.name == "Dana Cole"
    assert session.persona.voice_id == "eleven:dana"


def test_trainer_persona_id_selects_specific():
    lib = PersonaLibrary.from_records(PERSONAS)
    trainer = MockInterviewTrainer(persona_library=lib)
    target = next(p for p in lib.all() if p.name == "Sam Rivera")
    session = trainer.start_session(UserProfile(user_id="u1"), persona_id=target.id, max_questions=2)
    assert session.persona.name == "Sam Rivera"


# --- question bank ----------------------------------------------------------
def test_question_bank_drives_plan_with_default_fallback():
    bank = QuestionBank.from_records(BANK)
    trainer = MockInterviewTrainer(question_bank=bank)
    # technical style → its own set
    s = trainer.start_session(UserProfile(user_id="u1"), style=InterviewerStyle.TECHNICAL, max_questions=2)
    assert s.plan[:2] == ["Design a rate limiter.", "Toughest production incident you owned?"]
    # a style with no bucket → the "default" bucket
    s2 = trainer.start_session(UserProfile(user_id="u1"), style=InterviewerStyle.FRIENDLY, max_questions=2)
    assert s2.plan[0] == "Give me your two-minute story."


# --- media providers --------------------------------------------------------
def test_media_providers_offline_by_default():
    s = Settings()
    assert isinstance(build_speech_provider(s), NullSpeechProvider)
    assert build_speech_provider(s).enabled is False
    assert build_avatar_provider(s).enabled is False


def test_speech_provider_http_when_configured():
    s = Settings(tts_provider="http", tts_url="https://example.test/tts")
    provider = build_speech_provider(s)
    assert isinstance(provider, HttpSpeechProvider) and provider.enabled is True


# --- API --------------------------------------------------------------------
def _client(settings=None) -> TestClient:
    return TestClient(create_app(state=AppState(settings=settings, exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_capabilities_offline_defaults():
    client = _client()
    h = _auth(client)
    caps = client.get("/api/v1/interview/media/capabilities", headers=h).json()
    # TTS/video are off offline; personas are the built-in gallery (always present).
    assert caps["tts"] is False and caps["video"] is False
    assert caps["personas"] >= 4


def test_api_tts_501_when_unconfigured():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/interview/tts", headers=h, json={"text": "hello"})
    assert r.status_code == 501


def test_api_personas_and_start_from_library(tmp_path):
    lib_file = tmp_path / "personas.json"
    lib_file.write_text(json.dumps(PERSONAS), encoding="utf-8")
    client = _client(Settings(persona_library_path=str(lib_file)))
    h = _auth(client)

    listing = client.get("/api/v1/interview/personas", headers=h).json()
    assert {p["name"] for p in listing} == {"Dana Cole", "Sam Rivera"}
    caps = client.get("/api/v1/interview/media/capabilities", headers=h).json()
    assert caps["personas"] == 2

    dana = next(p for p in listing if p["name"] == "Dana Cole")
    started = client.post(
        "/api/v1/interview/mock/start", headers=h, json={"persona_id": dana["id"], "max_questions": 2}
    ).json()
    assert started["persona"]["name"] == "Dana Cole"
    assert started["persona"]["voice_id"] == "eleven:dana"
