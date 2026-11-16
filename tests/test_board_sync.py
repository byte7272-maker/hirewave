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


def test_board_sync_prepare_returns_assisted_bundle():
    client, state = _client_state()
    h = _auth(client)
    user_id = state.users.find(email="b@x.com")[0].id
    state.integration.tokens.save(user_id=user_id, provider=Provider.INDEED,
                                  access_token="t", account_email="")
    up = client.post("/api/v1/resumes/upload", headers=h,
                     files={"file": ("cv.md", b"# Me\n## Experience\n- x", "text/markdown")}).json()
    r = client.post("/api/v1/documents/board-sync/prepare", headers=h,
                    json={"board": "indeed", "doc_type": "resume"})
    assert r.status_code == 200
    b = r.json()
    # Assisted by default (automation not live): download file + deep link + steps.
    assert b["mode"] == "assisted" and b["connected"] is True and b["automation_available"] is False
    assert b["download_url"] == f"/api/v1/resumes/{up['id']}/file"
    assert b["manage_url"] and b["steps"]


def test_board_sync_prepare_rejects_unsupported():
    client, _ = _client_state()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Me", "text/markdown")})
    r = client.post("/api/v1/documents/board-sync/prepare", headers=h,
                    json={"board": "greenhouse", "doc_type": "resume"})
    assert r.status_code == 400


def test_mark_sync_rejects_unsupported_board():
    client, state = _client_state()
    h = _auth(client)
    client.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("cv.md", b"# Me", "text/markdown")})
    r = client.post("/api/v1/documents/board-sync", headers=h,
                    json={"board": "greenhouse", "doc_type": "resume"})
    assert r.status_code == 400


def _connect_indeed(state, email="b@x.com"):
    user_id = state.users.find(email=email)[0].id
    state.integration.tokens.save(user_id=user_id, provider=Provider.INDEED,
                                  access_token="t", account_email="")
    return user_id


def test_per_board_resume_assignment_overrides_primary():
    # A user keeps a DIFFERENT general résumé on a specific site: pin résumé B to Indeed
    # and the board row + prepare bundle use B, not the primary (A).
    client, state = _client_state()
    h = _auth(client)
    _connect_indeed(state)
    a = client.post("/api/v1/resumes/upload", headers=h,
                    files={"file": ("data.md", b"# Data CV\n- x", "text/markdown")}).json()
    b = client.post("/api/v1/resumes/upload", headers=h,
                    files={"file": ("pm.md", b"# PM CV\n- y", "text/markdown")}).json()

    st = client.get("/api/v1/documents/board-sync", headers=h).json()
    # Résumés are offered as pin options.
    opt_ids = {o["resume_id"] for o in st["resume_options"]}
    assert {a["id"], b["id"]} <= opt_ids
    indeed = next(r for r in st["boards"] if r["board"] == "indeed" and r["doc_type"] == "resume")
    assert indeed["pinned"] is False  # inheriting the primary so far

    # Pin résumé B to Indeed.
    pinned = client.put("/api/v1/documents/board-sync/assignment", headers=h,
                        json={"board": "indeed", "resume_id": b["id"]}).json()
    assert pinned["resume_id"] == b["id"] and pinned["pinned"] is True

    st2 = client.get("/api/v1/documents/board-sync", headers=h).json()
    indeed2 = next(r for r in st2["boards"] if r["board"] == "indeed")
    assert indeed2["resume_id"] == b["id"] and indeed2["pinned"] is True

    # Prepare for Indeed with no explicit résumé uses the pinned B.
    prep = client.post("/api/v1/documents/board-sync/prepare", headers=h,
                       json={"board": "indeed", "doc_type": "resume"}).json()
    assert prep["download_url"] == f"/api/v1/resumes/{b['id']}/file"


def test_clearing_assignment_falls_back_to_primary():
    client, state = _client_state()
    h = _auth(client)
    _connect_indeed(state)
    a = client.post("/api/v1/resumes/upload", headers=h,
                    files={"file": ("a.md", b"# A", "text/markdown")}).json()
    b = client.post("/api/v1/resumes/upload", headers=h,
                    files={"file": ("b.md", b"# B", "text/markdown")}).json()
    client.put("/api/v1/documents/board-sync/assignment", headers=h,
               json={"board": "indeed", "resume_id": b["id"]})
    # Make A the primary so the fallback target is deterministic.
    client.post(f"/api/v1/resumes/{a['id']}/set-primary", headers=h)
    cleared = client.put("/api/v1/documents/board-sync/assignment", headers=h,
                         json={"board": "indeed", "resume_id": ""}).json()
    assert cleared["pinned"] is False and cleared["resume_id"] == a["id"]


def test_assignment_rejects_unsupported_board_and_missing_resume():
    client, state = _client_state()
    h = _auth(client)
    up = client.post("/api/v1/resumes/upload", headers=h,
                     files={"file": ("a.md", b"# A", "text/markdown")}).json()
    # No reusable résumé profile on a pure ATS.
    assert client.put("/api/v1/documents/board-sync/assignment", headers=h,
                      json={"board": "greenhouse", "resume_id": up["id"]}).status_code == 400
    # Unknown résumé id.
    assert client.put("/api/v1/documents/board-sync/assignment", headers=h,
                      json={"board": "indeed", "resume_id": "res_nope"}).status_code == 404
