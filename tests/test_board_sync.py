"""Keep résumé / cover letter in sync across boards: drift detection + mark-synced,
with pure per-application ATS reported as unsupported."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.board_sync import board_supports, sync_status_for
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import Provider


def _client_state():
    state = AppState(exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def _auth(client) -> dict:
    client.post("/api/v1/auth/register", json={"email": "b@x.com", "password": "supersecret", "full_name": "B"})
    tok = client.post("/api/v1/auth/login", json={"email": "b@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_capability_matrix():
    assert board_supports("linkedin", "resume") is True
    assert board_supports("linkedin", "cover_letter") is False
    # Pure per-application ATS keep no reusable profile document.
    assert board_supports("greenhouse", "resume") is False
    assert board_supports("workday", "resume") is False


def test_sync_status_flags_drift_then_in_sync():
    drifted = sync_status_for("indeed", "resume", active_version=3, synced=None)
    assert drifted["supported"] and drifted["drifted"] and not drifted["in_sync"]
    assert drifted["manage_url"] and drifted["steps"]

    synced = sync_status_for("indeed", "resume", active_version=3, synced={"version": 3})
    assert synced["in_sync"] and not synced["drifted"]


def test_board_sync_status_and_mark_round_trip():
    client, state = _client_state()
    h = _auth(client)
    # A connected board (OAuth to Indeed) + an uploaded résumé (seeds version 1).
    user_id = state.users.find(email="b@x.com")[0].id
    state.integration.tokens.save(user_id=user_id, provider=Provider.INDEED,
                                  access_token="t", account_email="")
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Me\n## Experience\n- Built things", "text/markdown")})

    st = client.get("/api/v1/documents/board-sync", headers=h).json()
    indeed = [r for r in st["boards"] if r["board"] == "indeed" and r["doc_type"] == "resume"]
    assert indeed and indeed[0]["drifted"] is True  # never synced yet
    assert st["drifted"] >= 1

    # Mark Indeed as synced to the current version -> no longer drifted.
    marked = client.post("/api/v1/documents/board-sync", headers=h,
                         json={"board": "indeed", "doc_type": "resume"}).json()
    assert marked["in_sync"] is True

    st2 = client.get("/api/v1/documents/board-sync", headers=h).json()
    indeed2 = [r for r in st2["boards"] if r["board"] == "indeed" and r["doc_type"] == "resume"]
    assert indeed2[0]["in_sync"] is True


def test_mark_sync_rejects_unsupported_board():
    client, state = _client_state()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Me", "text/markdown")})
    r = client.post("/api/v1/documents/board-sync", headers=h,
                    json={"board": "greenhouse", "doc_type": "resume"})
    assert r.status_code == 400
