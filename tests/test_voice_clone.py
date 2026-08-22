"""Server TTS provider selection + the voice-cloning framework."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import (
    ElevenLabsSpeechProvider,
    MockVoiceCloneProvider,
    NullSpeechProvider,
    NullVoiceCloneProvider,
    OpenAISpeechProvider,
    build_speech_provider,
    build_voice_clone_provider,
)


# --- provider selection -----------------------------------------------------
def test_tts_provider_selection():
    assert isinstance(build_speech_provider(Settings(tts_provider="none")), NullSpeechProvider)
    el = build_speech_provider(Settings(tts_provider="elevenlabs", tts_api_key="k"))
    assert isinstance(el, ElevenLabsSpeechProvider) and el.enabled
    oa = build_speech_provider(Settings(tts_provider="openai", tts_api_key="k"))
    assert isinstance(oa, OpenAISpeechProvider) and oa.enabled
    # provider named but no key → stays disabled (never half-configured)
    assert isinstance(build_speech_provider(Settings(tts_provider="elevenlabs")), NullSpeechProvider)


def test_voice_clone_provider_selection():
    assert isinstance(build_voice_clone_provider(Settings(voice_clone_provider="none")), NullVoiceCloneProvider)
    assert not build_voice_clone_provider(Settings(voice_clone_provider="none")).enabled
    mock = build_voice_clone_provider(Settings(voice_clone_provider="mock"))
    assert isinstance(mock, MockVoiceCloneProvider) and mock.enabled


def test_mock_clone_is_deterministic():
    p = MockVoiceCloneProvider()
    a = p.create("My Voice", [b"aaa"])
    b = p.create("My Voice", [b"aaa"])
    assert a.external_id == b.external_id and a.external_id.startswith("mock_voice_")
    assert p.create("", [b"x"]) is None  # needs a name
    assert p.create("x", []) is None  # needs samples
    assert p.delete(a.external_id) is True


# --- API (mock cloning provider) --------------------------------------------
def _mock_app():
    return TestClient(
        create_app(state=AppState(settings=Settings(voice_clone_provider="mock"), exchanger=MockTokenExchanger()))
    )


def _off_app():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))  # default: none


def _auth(client, email="clone@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "C"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_capabilities_reports_clone_flag():
    on = _mock_app()
    h = _auth(on)
    assert on.get("/api/v1/interview/media/capabilities", headers=h).json()["voice_clone"] is True
    off = _off_app()
    h2 = _auth(off, "off@demo.com")
    assert off.get("/api/v1/interview/media/capabilities", headers=h2).json()["voice_clone"] is False


def test_create_requires_consent():
    client = _mock_app()
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/voices/custom",
        headers=h,
        data={"name": "My Voice", "consent": "false"},
        files={"files": ("s.mp3", b"ID3audio", "audio/mpeg")},
    )
    assert r.status_code == 400 and "consent" in r.json()["detail"].lower()


def test_create_list_delete_flow():
    client = _mock_app()
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/voices/custom",
        headers=h,
        data={"name": "My Voice", "consent": "true"},
        files=[("files", ("a.mp3", b"ID3aaa", "audio/mpeg")), ("files", ("b.wav", b"RIFFbbb", "audio/wav"))],
    )
    assert r.status_code == 201
    v = r.json()
    assert v["external_voice_id"].startswith("mock_voice_")
    assert v["consent_attested"] is True and v["sample_count"] == 2 and v["provider"] == "mock"
    vid = v["id"]
    # list
    assert len(client.get("/api/v1/interview/voices/custom", headers=h).json()) == 1
    # assign to a persona via the existing per-persona voice endpoint
    pid = client.get("/api/v1/interview/personas", headers=h).json()[0]["id"]
    pv = client.put(
        f"/api/v1/interview/personas/{pid}/voice",
        headers=h,
        json={"source": "server", "voice_id": v["external_voice_id"]},
    ).json()
    assert pv["source"] == "server" and pv["voice_id"] == v["external_voice_id"]
    # delete
    assert client.delete(f"/api/v1/interview/voices/custom/{vid}", headers=h).status_code == 204
    assert client.get("/api/v1/interview/voices/custom", headers=h).json() == []


def test_create_rejects_bad_format():
    client = _mock_app()
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/voices/custom",
        headers=h,
        data={"name": "V", "consent": "true"},
        files={"files": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 415


def test_create_501_when_disabled():
    client = _off_app()
    h = _auth(client, "off2@demo.com")
    r = client.post(
        "/api/v1/interview/voices/custom",
        headers=h,
        data={"name": "V", "consent": "true"},
        files={"files": ("s.mp3", b"ID3", "audio/mpeg")},
    )
    assert r.status_code == 501


def test_custom_voices_owner_scoped_and_auth():
    client = _mock_app()
    assert client.get("/api/v1/interview/voices/custom").status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    v = client.post(
        "/api/v1/interview/voices/custom",
        headers=ha,
        data={"name": "A voice", "consent": "true"},
        files={"files": ("s.mp3", b"ID3", "audio/mpeg")},
    ).json()
    assert client.get("/api/v1/interview/voices/custom", headers=hb).json() == []
    assert client.delete(f"/api/v1/interview/voices/custom/{v['id']}", headers=hb).status_code == 404
