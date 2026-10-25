"""Pre-rendered interviewer clips: the fixed-line matcher, the clip builder, and
the API (build / status / serve / video lookup)."""

from __future__ import annotations

import types

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview.clip_builder import build_clips, clip_key
from jobsearch.engines.interview.heygen import MockHeyGenClient, build_heygen_client
from jobsearch.engines.interview.scripts import FIXED_LINES, line_id_for_text, line_text


# --- fixed-line matcher -----------------------------------------------------
def test_line_matcher_exact_alias_and_substring():
    assert line_id_for_text("To start, tell me about yourself and your background.") == "intro"
    # alias
    assert line_id_for_text("Tell me about yourself") == "intro"
    # substring of a longer spoken line
    assert line_id_for_text("Okay — now, where do you see yourself in five years?") == "closing"
    # a job-specific question is not a fixed line
    assert line_id_for_text("What do you know about our Kubernetes migration?") == ""
    assert line_text("greeting").startswith("Hi")


# --- clip builder (offline, mock client) ------------------------------------
class _FakeDocs:
    def __init__(self):
        self.d = {}

    def get(self, k):
        return self.d.get(k)

    def put(self, k, b, content_type=""):
        self.d[k] = (b, content_type)


def _persona(pid, slug):
    return types.SimpleNamespace(
        id=pid, avatar_url=f"https://x/static/personas/{slug}.webp"
    )


def test_build_clips_limits_and_resumes(tmp_path):
    (tmp_path / "personas").mkdir()
    (tmp_path / "personas" / "a.webp").write_bytes(b"IMGA")
    (tmp_path / "personas" / "b.webp").write_bytes(b"IMGB")
    personas = [_persona("p_a", "a"), _persona("p_b", "b")]
    docs = _FakeDocs()
    client = MockHeyGenClient()

    total = len(personas) * len(FIXED_LINES)
    r1 = build_clips(client, personas, docs, tmp_path, voice_id="v1", limit=3)
    assert r1["built_this_call"] == 3
    assert r1["total"] == total and r1["built"] == 3 and r1["remaining"] == total - 3

    # resume until done; already-built clips are skipped (not regenerated)
    guard = 0
    while r1["remaining"] and guard < 50:
        r1 = build_clips(client, personas, docs, tmp_path, voice_id="v1", limit=5)
        guard += 1
    assert r1["remaining"] == 0 and r1["built"] == total
    # talking photo uploaded once per persona, not per line
    assert client.uploaded == 2
    # a known clip is stored as mp4 bytes
    first_line = FIXED_LINES[0][0]
    data, ctype = docs.get(clip_key("p_a", first_line))
    assert ctype == "video/mp4" and data.startswith(b"MOCK_MP4_BYTES")


def test_build_clips_reports_missing_photo(tmp_path):
    (tmp_path / "personas").mkdir()
    personas = [_persona("p_missing", "nope")]
    docs = _FakeDocs()
    r = build_clips(MockHeyGenClient(), personas, docs, tmp_path, voice_id="v1", limit=5)
    assert r["built_this_call"] == 0 and r["remaining"] == len(FIXED_LINES)
    assert any("no bundled photo" in e for e in r["errors"])


def test_build_heygen_client_requires_key():
    assert build_heygen_client(Settings()) is None
    assert build_heygen_client(Settings(heygen_api_key="k")) is not None


# --- API --------------------------------------------------------------------
def _app(settings=None):
    state = AppState(settings=settings or Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(client):
    client.post("/api/v1/auth/register", json={"email": "c@d.com", "password": "supersecret", "full_name": "C"})
    tok = client.post("/api/v1/auth/login", json={"email": "c@d.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_video_returns_prerendered_clip_when_cached():
    state, client = _app()
    h = _auth(client)
    pid = state.persona_library.all()[0].id
    state.documents.put(clip_key(pid, "intro"), b"MP4DATA", content_type="video/mp4")

    r = client.post(
        "/api/v1/interview/video", headers=h,
        json={"text": "To start, tell me about yourself and your background.", "persona": {"id": pid}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "prerendered"
    assert body["video_url"].endswith(f"/api/v1/interview/clip/{pid}/intro")

    # the clip serves publicly (no auth) as video bytes
    served = client.get(f"/api/v1/interview/clip/{pid}/intro")
    assert served.status_code == 200 and served.content == b"MP4DATA"
    assert served.headers["content-type"].startswith("video/mp4")


def test_video_501_without_clip_or_provider():
    state, client = _app()
    h = _auth(client)
    pid = state.persona_library.all()[0].id
    # a dynamic, non-fixed question with nothing configured
    r = client.post(
        "/api/v1/interview/video", headers=h,
        json={"text": "What interests you about our data platform?", "persona": {"id": pid}},
    )
    assert r.status_code == 501


def test_clip_serve_404_when_absent():
    _, client = _app()
    assert client.get("/api/v1/interview/clip/nope/intro").status_code == 404


def test_build_endpoint_501_without_key():
    _, client = _app()
    h = _auth(client)
    assert client.post("/api/v1/interview/avatars/build", headers=h).status_code == 501


def test_build_endpoint_runs_with_mock(monkeypatch):
    state, client = _app(Settings(heygen_voice_id="v_test"))
    h = _auth(client)
    monkeypatch.setattr(
        "jobsearch.api.routers.interview.build_heygen_client", lambda s=None: MockHeyGenClient()
    )
    r = client.post("/api/v1/interview/avatars/build?limit=2", headers=h)
    assert r.status_code == 200
    rep = r.json()
    assert rep["built_this_call"] == 2 and rep["built"] == 2 and rep["remaining"] > 0

    status = client.get("/api/v1/interview/avatars/clips", headers=h).json()
    assert status["built"] == 2 and status["total"] == rep["total"]


def test_build_endpoint_needs_voice_id(monkeypatch):
    _, client = _app(Settings(heygen_api_key="k"))  # key present, voice id blank
    h = _auth(client)
    r = client.post("/api/v1/interview/avatars/build", headers=h)
    assert r.status_code == 400 and "voice id" in r.json()["detail"].lower()


def test_build_subset_only_renders_requested_lines(monkeypatch):
    state, client = _app(Settings(heygen_voice_id="v_test"))
    h = _auth(client)
    monkeypatch.setattr(
        "jobsearch.api.routers.interview.build_heygen_client", lambda s=None: MockHeyGenClient()
    )
    n_personas = len(state.persona_library.all())
    r = client.post("/api/v1/interview/avatars/build?lines=greeting,intro&limit=50", headers=h)
    assert r.status_code == 200
    rep = r.json()
    # scoped total = personas × 2 requested lines, and all get built in one call
    assert rep["total"] == n_personas * 2
    assert rep["built"] == n_personas * 2 and rep["remaining"] == 0

    # only greeting+intro clips exist; the other fixed lines were not rendered
    pid = state.persona_library.all()[0].id
    assert state.documents.get(clip_key(pid, "greeting")) is not None
    assert state.documents.get(clip_key(pid, "closing")) is None

    # scoped status matches; full status still shows the rest outstanding
    scoped = client.get("/api/v1/interview/avatars/clips?lines=greeting,intro", headers=h).json()
    assert scoped["remaining"] == 0 and scoped["total"] == n_personas * 2
    full = client.get("/api/v1/interview/avatars/clips", headers=h).json()
    assert full["built"] == n_personas * 2 and full["remaining"] > 0


def test_build_rejects_unknown_line(monkeypatch):
    _, client = _app(Settings(heygen_voice_id="v_test"))
    h = _auth(client)
    monkeypatch.setattr(
        "jobsearch.api.routers.interview.build_heygen_client", lambda s=None: MockHeyGenClient()
    )
    r = client.post("/api/v1/interview/avatars/build?lines=greeting,bogus", headers=h)
    assert r.status_code == 400 and "bogus" in r.json()["detail"]
