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
    # /voices now returns the EFFECTIVE voice for every persona (derived defaults when
    # none saved) so the client speaks each interviewer distinctly.
    allv = client.get("/api/v1/interview/voices", headers=h).json()
    personas = client.get("/api/v1/interview/personas", headers=h).json()
    assert len(allv) == len(personas) and {v["persona_id"] for v in allv} == {p["id"] for p in personas}
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
    # persisted + listed: the saved pref overlays the per-persona defaults.
    lst = client.get("/api/v1/interview/voices", headers=h).json()
    saved = next(v for v in lst if v["persona_id"] == pid)
    assert saved["voice_uri"] == "Google US English"


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
    # Reset → that persona falls back to its derived default (not the custom "X").
    back = next(v for v in client.get("/api/v1/interview/voices", headers=h).json() if v["persona_id"] == pid)
    assert back.get("voice_uri", "") != "X"


def test_voice_prefs_owner_scoped():
    client = _client()
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    pid = _first_persona_id(client, ha)
    client.put(f"/api/v1/interview/personas/{pid}/voice", headers=ha, json={"voice_uri": "A-voice"})
    # B sees per-persona defaults, never A's customization.
    bvoices = client.get("/api/v1/interview/voices", headers=hb).json()
    assert all(v.get("voice_uri", "") != "A-voice" for v in bvoices)
    # and B can't read A's uploaded clip (none uploaded → 404 either way)
    assert client.get(f"/api/v1/interview/personas/{pid}/voice/audio", headers=hb).status_code == 404


def test_voice_prefs_require_auth():
    client = _client()
    assert client.get("/api/v1/interview/voices").status_code == 401


def test_every_persona_voice_matches_its_gender():
    """A persona must never speak in an opposite-gender voice (e.g. a female persona
    mapped to the male-sounding 'fable')."""
    from jobsearch.api.routers.interview import _VOICE_GENDER, _server_voice_for
    from jobsearch.config import Settings

    class _P:
        def __init__(self, name, gender):
            self.name, self.gender, self.voice_id = name, gender, ""

    s = Settings(tts_provider="openai", tts_api_key="k")
    cases = [("Maya Patel", "female"), ("Priya Nair", "female"), ("Dr. Elena Rossi", "female"),
             ("Devon Clark", "male"), ("Marcus Chen", "male"), ("Jordan Blake", "neutral")]
    for name, gender in cases:
        vid = _server_voice_for(_P(name, gender), s)
        vg = _VOICE_GENDER.get(vid)
        assert vid, f"{name} got no voice"
        if gender in ("male", "female"):
            assert vg in (gender, "neutral"), f"{name} ({gender}) got {vid} ({vg})"


def test_jordan_blake_is_female_with_a_distinct_female_voice():
    from jobsearch.api.routers.interview import _VOICE_GENDER, _server_voice_for
    from jobsearch.config import Settings
    from jobsearch.engines.interview.persona_library import default_personas

    jordan = next(p for p in default_personas() if p.name == "Jordan Blake")
    assert jordan.gender == "female"  # matches her photo
    vid = _server_voice_for(jordan, Settings(tts_provider="openai", tts_api_key="k"))
    assert _VOICE_GENDER.get(vid) == "female"  # a female voice (never a male one)


def test_realistic_avatar_override_replaces_generated():
    from jobsearch.config import Settings
    from jobsearch.engines.interview.persona_library import resolve_avatar

    s = Settings(persona_avatars={"Jordan Blake": "https://cdn.example.com/jordan.png"})
    assert resolve_avatar("Jordan Blake", gender="female", settings=s) == "https://cdn.example.com/jordan.png"
    # an explicit per-record url still wins over the override map
    assert resolve_avatar("Jordan Blake", explicit_url="https://x/explicit.png", settings=s) == "https://x/explicit.png"
    # no override → the generated fallback
    assert "dicebear" in resolve_avatar("Someone New", settings=Settings())


def test_personas_use_realistic_photos_not_cartoons():
    from jobsearch.engines.interview.persona_library import default_personas

    ps = default_personas()
    assert len(ps) == 12  # 6 original + 6 new interviewers
    for p in ps:
        assert "/static/personas/" in p.avatar_url and p.avatar_url.endswith(".webp")
        assert "dicebear" not in p.avatar_url  # no cartoon fallback
        assert p.gender in ("male", "female", "neutral")


def test_static_persona_photos_are_served():
    from fastapi.testclient import TestClient

    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState
    from jobsearch.engines.integration import MockTokenExchanger

    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    r = client.get("/static/personas/devon_clark.webp")
    assert r.status_code == 200 and len(r.content) > 500  # a real image is served
