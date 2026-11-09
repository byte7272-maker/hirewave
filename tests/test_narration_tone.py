"""Friendly voice + friendly language.

- ``POST /narration/speak`` steers the TTS with a warm, friendly tone instruction
  by default, and honours a per-request override.
- ``soften_tone`` rewrites harsh criticism ("fails"/"lacks"/"weak"/"poor") into
  warm, constructive wording for anything the user reads, without mangling neutral
  descriptors like "weak verbs".
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.resume_assistant import soften_tone


# --- soften_tone ------------------------------------------------------------

def test_soften_tone_removes_harsh_words():
    assert "fail" not in soften_tone("This fails to quantify impact.").lower()
    assert "lacks" not in soften_tone("Your summary lacks metrics.").lower()
    s = soften_tone("The summary is weak and the bullets are poor.")
    assert "weak" not in s.lower() and "poor" not in s.lower()


def test_soften_tone_keeps_meaning_and_metrics_word():
    assert "metrics" in soften_tone("Your summary lacks metrics.")
    assert "quantify" in soften_tone("It fails to quantify impact.")


def test_soften_tone_handles_failing_and_violates():
    s = soften_tone("It violates the XYZ formula by failing to provide unique accomplishments.")
    assert "violat" not in s.lower() and "failing" not in s.lower()
    assert "provide unique accomplishments" in s  # meaning preserved


def test_soften_tone_leaves_neutral_descriptors():
    # "weak verbs" is a neutral descriptor, not a criticism of the person — untouched.
    assert soften_tone("Replace weak verbs with strong ones.") == "Replace weak verbs with strong ones."


def test_soften_tone_empty():
    assert soften_tone("") == ""


# --- /narration/speak tone instruction --------------------------------------

class _RecordingSpeech:
    """Fake TTS that records the kwargs it was called with."""

    enabled = True
    last: dict = {}

    def synthesize(self, text: str, *, voice: str = "", instructions: str = ""):
        _RecordingSpeech.last = {"text": text, "voice": voice, "instructions": instructions}
        return b"AUDIOBYTES"


def _client_with_recording_speech():
    state = AppState()
    state.speech = _RecordingSpeech()
    return TestClient(create_app(state=state))


def _auth(client, email="tone@demo.com"):
    client.post("/api/v1/auth/register",
                json={"email": email, "password": "supersecret12", "full_name": "T"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": email, "password": "supersecret12"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_speak_passes_default_friendly_instruction():
    _RecordingSpeech.last = {}
    client = _client_with_recording_speech()
    h = _auth(client)
    r = client.post("/api/v1/narration/speak", headers=h, json={"text": "Hello", "voice": "coral"})
    assert r.status_code == 200, r.text
    assert r.content == b"AUDIOBYTES"
    instr = _RecordingSpeech.last["instructions"].lower()
    assert "friendly" in instr and "warm" in instr  # the default warm tone
    assert _RecordingSpeech.last["voice"] == "coral"


def test_speak_respects_instruction_override():
    _RecordingSpeech.last = {}
    client = _client_with_recording_speech()
    h = _auth(client, email="tone2@demo.com")
    r = client.post("/api/v1/narration/speak", headers=h,
                    json={"text": "Hi there", "instructions": "Speak slowly and calmly."})
    assert r.status_code == 200
    assert _RecordingSpeech.last["instructions"] == "Speak slowly and calmly."
