"""Server speech-to-text — POST /api/v1/narration/transcribe.

Decouples capture (universal MediaRecorder) from transcription so voice input
works on any browser/device. 501 when no STT source is configured (client falls
back to the browser's SpeechRecognition); 200 with text when one is.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.interview.media import (
    NullTranscribeProvider,
    OpenAITranscribeProvider,
    _iso_639_1,
    build_transcribe_provider,
)


def _auth(client, email="stt@demo.com"):
    client.post("/api/v1/auth/register",
                json={"email": email, "password": "supersecret12", "full_name": "S"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": email, "password": "supersecret12"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_transcribe_501_when_no_stt_configured():
    client = TestClient(create_app(state=AppState()))  # default: stt off
    h = _auth(client)
    r = client.post("/api/v1/narration/transcribe", headers=h,
                    files={"file": ("a.webm", b"RIFFfakeaudio", "audio/webm")})
    assert r.status_code == 501


class _FakeTranscribe:
    enabled = True
    last = {}

    def transcribe(self, audio, *, filename="audio.webm", content_type="", language=""):
        _FakeTranscribe.last = {"bytes": len(audio), "filename": filename, "language": language}
        return "  analyze my matches  "


def test_transcribe_returns_text():
    _FakeTranscribe.last = {}
    state = AppState()
    state.transcribe = _FakeTranscribe()
    client = TestClient(create_app(state=state))
    h = _auth(client, email="stt2@demo.com")
    r = client.post("/api/v1/narration/transcribe", headers=h,
                    files={"file": ("clip.webm", b"0123456789", "audio/webm")},
                    data={"language": "en"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"] == "analyze my matches"  # stripped
    assert _FakeTranscribe.last["bytes"] == 10
    assert _FakeTranscribe.last["language"] == "en"


def test_transcribe_normalizes_browser_language_to_iso_639_1():
    # Browsers send a BCP-47 tag ("en-US"); Whisper 400s on it ("Invalid language
    # 'en-us'"). The endpoint must hand the provider the ISO-639-1 primary subtag.
    _FakeTranscribe.last = {}
    state = AppState()
    state.transcribe = _FakeTranscribe()
    client = TestClient(create_app(state=state))
    h = _auth(client, email="stt5@demo.com")
    r = client.post("/api/v1/narration/transcribe", headers=h,
                    files={"file": ("clip.webm", b"0123456789", "audio/webm")},
                    data={"language": "en-US"})
    assert r.status_code == 200, r.text
    assert _FakeTranscribe.last["language"] == "en"


def test_iso_639_1_normalization():
    assert _iso_639_1("en-US") == "en"
    assert _iso_639_1("en-us") == "en"
    assert _iso_639_1("en_GB") == "en"
    assert _iso_639_1("EN") == "en"
    assert _iso_639_1("es") == "es"
    assert _iso_639_1("") == ""
    assert _iso_639_1("english") == ""   # not a 2-3 letter code → no hint (auto-detect)
    assert _iso_639_1("zh-Hant") == "zh"


def test_transcribe_rejects_empty_audio():
    state = AppState()
    state.transcribe = _FakeTranscribe()
    client = TestClient(create_app(state=state))
    h = _auth(client, email="stt3@demo.com")
    r = client.post("/api/v1/narration/transcribe", headers=h,
                    files={"file": ("a.webm", b"", "audio/webm")})
    assert r.status_code == 400


def test_transcribe_502_when_provider_returns_none():
    class _Broken:
        enabled = True
        last_error = "boom"

        def transcribe(self, *a, **k):
            return None

    state = AppState()
    state.transcribe = _Broken()
    client = TestClient(create_app(state=state))
    h = _auth(client, email="stt4@demo.com")
    r = client.post("/api/v1/narration/transcribe", headers=h,
                    files={"file": ("a.webm", b"abc", "audio/webm")})
    assert r.status_code == 502
    assert "boom" in r.json()["detail"]


# --- provider factory -------------------------------------------------------

def test_build_transcribe_provider_off_by_default():
    assert isinstance(build_transcribe_provider(Settings()), NullTranscribeProvider)
    assert build_transcribe_provider(Settings()).enabled is False


def test_build_transcribe_provider_openai_reuses_tts_key():
    s = Settings(stt_provider="openai", tts_api_key="sk-test")  # no dedicated stt key
    p = build_transcribe_provider(s)
    assert isinstance(p, OpenAITranscribeProvider) and p.enabled is True
