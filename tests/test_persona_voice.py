"""Per-persona voice selection + upload, and stable persona ids."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview.persona_library import default_personas, persona_id_for


# --- stable ids -------------------------------------------------------------
def test_persona_ids_are_stable():
    a = {p.name: p.id for p in default_personas()}
    b = {p.name: p.id for p in default_personas()}
    assert a == b  # same ids across calls (not random)
    assert all(pid.startswith("persona_") for pid in a.values())
    assert a["Devon Clark"] == persona_id_for("devon clark")  # name-derived, case-insensitive


# --- API helpers ------------------------------------------------------------
def _auth(client, email="voice@demo.com"):
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "supersecret12", "full_name": "V"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "supersecret12"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _first_persona_id(client, h):
    return client.get("/api/v1/interview/personas", headers=h).json()[0]["id"]


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


# --- browser voice selection ------------------------------------------------
def test_default_voice_is_derived():
    client = _client()
    h = _auth(client)
    assert client.get("/api/v1/interview/voices", headers=h).json() == []  # none saved
    pid = _first_persona_id(client, h)
    v = client.get(f"/api/v1/interview/personas/{pid}/voice", headers=h).json()
    assert v["persona_id"] == pid
    assert v["source"] in ("browser", "server")  # derived from the persona


def test_openai_provider_gives_distinct_server_voices():
    from jobsearch.config import Settings

    client = TestClient(
        create_app(state=AppState(settings=Settings(tts_provider="openai", tts_api_key="k"), exchanger=MockTokenExchanger()))
    )
    h = _auth(client)
    personas = client.get("/api/v1/interview/personas", headers=h).json()
    voices = []
    for p in personas:
        v = client.get(f"/api/v1/interview/personas/{p['id']}/voice", headers=h).json()
        assert v["source"] == "server"
        assert v["voice_id"]  # a concrete neural voice, not empty
        voices.append(v["voice_id"])
    # the gallery no longer sounds identical — several distinct voices
    assert len(set(voices)) >= 4


def test_set_browser_voice_and_persist():
    client = _client()
    h = _auth(client)
    pid = _first_persona_id(client, h)
    r = client.put(
        f"/api/v1/interview/personas/{pid}/voice",
        headers=h,
        json={"source": "browser", "voice_uri": "Google US English", "rate": 5.0, "pitch": 1.2, "lang": "en-US"},
    )
    assert r.status_code == 200
    v = r.json()
    assert v["voice_uri"] == "Google US English"
    assert v["rate"] == 2.0  # clamped from 5.0 → max 2.0
    assert v["pitch"] == 1.2
    # persisted + listed
    lst = client.get("/api/v1/interview/voices", headers=h).json()
    assert len(lst) == 1 and lst[0]["persona_id"] == pid


def test_invalid_source_rejected():
    client = _client()
    h = _auth(client)
    pid = _first_persona_id(client, h)
    r = client.put(f"/api/v1/interview/personas/{pid}/voice", headers=h, json={"source": "nope"})
    assert r.status_code == 400


def test_unknown_persona_404():
    client = _client()
    h = _auth(client)
    assert client.get("/api/v1/interview/personas/persona_ffffffffffff/voice", headers=h).status_code == 404
    assert client.put(
        "/api/v1/interview/personas/persona_ffffffffffff/voice", headers=h, json={"rate": 1.0}
    ).status_code == 404


# --- upload -----------------------------------------------------------------
def test_upload_voice_clip_roundtrip():
    client = _client()
    h = _auth(client)
    pid = _first_persona_id(client, h)
    audio = b"ID3\x03\x00\x00\x00fake-mp3-bytes"
    r = client.post(
        f"/api/v1/interview/personas/{pid}/voice/upload",
        headers=h,
        files={"file": ("intro.mp3", audio, "audio/mpeg")},
    )
    assert r.status_code == 200
    v = r.json()
    assert v["source"] == "uploaded"
    assert v["audio_url"] == f"/api/v1/interview/personas/{pid}/voice/audio"
    assert v["content_type"] == "audio/mpeg"
    # fetch the clip back
    got = client.get(f"/api/v1/interview/personas/{pid}/voice/audio", headers=h)
    assert got.status_code == 200
    assert got.content == audio
    assert got.headers["content-type"].startswith("audio/mpeg")


def test_upload_rejects_bad_format():
    client = _client()
    h = _auth(client)
    pid = _first_persona_id(client, h)
    r = client.post(
        f"/api/v1/interview/personas/{pid}/voice/upload",
        headers=h,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 415


def test_reset_voice_pref():
    client = _client()
    h = _auth(client)
    pid = _first_persona_id(client, h)
    client.put(f"/api/v1/interview/personas/{pid}/voice", headers=h, json={"voice_uri": "X"})
    assert client.delete(f"/api/v1/interview/personas/{pid}/voice", headers=h).status_code == 204
    assert client.get("/api/v1/interview/voices", headers=h).json() == []


def test_voice_prefs_owner_scoped():
    client = _client()
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    pid = _first_persona_id(client, ha)
    client.put(f"/api/v1/interview/personas/{pid}/voice", headers=ha, json={"voice_uri": "A-voice"})
    # B has none of A's prefs
    assert client.get("/api/v1/interview/voices", headers=hb).json() == []
    # and B can't read A's uploaded clip (none uploaded → 404 either way)
    assert client.get(f"/api/v1/interview/personas/{pid}/voice/audio", headers=hb).status_code == 404


def test_voice_prefs_require_auth():
    client = _client()
    assert client.get("/api/v1/interview/voices").status_code == 401
