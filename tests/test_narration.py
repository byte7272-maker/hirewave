"""Narration — read summaries (and any text) aloud in an AI voice."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _state(**settings) -> AppState:
    return AppState(settings=Settings(**settings), exchanger=MockTokenExchanger())


def _client(state: AppState | None = None) -> TestClient:
    return TestClient(create_app(state=state or _state()))


def _auth(client: TestClient, email="a@b.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


class _FakeSpeech:
    """A server neural-voice source that echoes deterministic audio bytes."""

    enabled = True
    last_error = ""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def synthesize(self, text: str, *, voice: str = "") -> bytes:
        self.calls.append((text, voice))
        return b"ID3fake-audio-" + voice.encode()


def test_voices_offline_falls_back_to_browser():
    c = _client()
    h = _auth(c)
    data = c.get("/api/v1/narration/voices", headers=h).json()
    # No provider configured -> no server voices, but the browser can still read.
    assert data["server_tts"] is False
    assert data["provider"] == "none"
    assert data["voices"] == []
    assert data["browser_fallback"] is True


def test_voices_lists_openai_ai_voices_when_configured():
    c = _client(_state(tts_provider="openai", tts_api_key="k"))
    h = _auth(c)
    data = c.get("/api/v1/narration/voices", headers=h).json()
    assert data["server_tts"] is True and data["provider"] == "openai"
    ids = {v["id"] for v in data["voices"]}
    assert {"alloy", "echo", "fable", "onyx", "nova", "shimmer"} <= ids
    assert data["default_voice"] in ids  # a concrete voice to preselect on the switch
    assert all(v["kind"] == "server" and v["name"] and v["gender"] for v in data["voices"])


def test_voices_extra_expressive_voices_on_4o_mini_tts():
    c = _client(_state(tts_provider="openai", tts_api_key="k", tts_model="gpt-4o-mini-tts"))
    h = _auth(c)
    ids = {v["id"] for v in c.get("/api/v1/narration/voices", headers=h).json()["voices"]}
    assert {"coral", "sage", "verse"} <= ids  # expressive voices only on this model


def test_speak_501_when_no_server_voice():
    c = _client()
    h = _auth(c)
    r = c.post("/api/v1/narration/speak", headers=h, json={"text": "Read this summary."})
    assert r.status_code == 501  # client falls back to the browser voice


def test_speak_400_on_empty_text():
    c = _client()
    h = _auth(c)
    assert c.post("/api/v1/narration/speak", headers=h, json={"text": "   "}).status_code == 400


def test_speak_413_on_oversized_text():
    c = _client()
    h = _auth(c)
    r = c.post("/api/v1/narration/speak", headers=h, json={"text": "x" * 8001})
    assert r.status_code == 413


def test_speak_returns_audio_in_chosen_voice():
    state = _state()
    fake = _FakeSpeech()
    state.speech = fake  # inject a server neural-voice source
    c = _client(state)
    h = _auth(c)
    r = c.post("/api/v1/narration/speak", headers=h, json={"text": "Your resume scores an A.", "voice": "nova"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/")
    assert r.headers["cache-control"] == "no-store"
    assert r.content == b"ID3fake-audio-nova"
    assert fake.calls == [("Your resume scores an A.", "nova")]


def test_speak_requires_auth():
    c = _client()
    assert c.post("/api/v1/narration/speak", json={"text": "hi"}).status_code == 401


# --- read-aloud preferences (default OFF + auto-play toggle) -----------------
def test_prefs_default_reading_off():
    c = _client()
    h = _auth(c)
    p = c.get("/api/v1/narration/prefs", headers=h).json()
    # AI reading of summaries must default to off (nothing auto-plays).
    assert p["auto_play"] is False
    assert p["voice"] == ""


def test_prefs_auto_play_toggle_persists():
    c = _client()
    h = _auth(c)
    p = c.put("/api/v1/narration/prefs", headers=h, json={"auto_play": True, "voice": "nova"}).json()
    assert p["auto_play"] is True and p["voice"] == "nova"
    # survives a fresh fetch (stored on the profile)
    assert c.get("/api/v1/narration/prefs", headers=h).json()["auto_play"] is True
    # patch semantics: updating one field leaves the other intact
    p2 = c.put("/api/v1/narration/prefs", headers=h, json={"auto_play": False}).json()
    assert p2["auto_play"] is False and p2["voice"] == "nova"


def test_prefs_require_auth():
    c = _client()
    assert c.get("/api/v1/narration/prefs").status_code == 401
