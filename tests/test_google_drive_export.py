"""One-click "Open in Google Docs" — upload the current version to the user's Drive
as a native Google Doc. OAuth + Drive upload are both mocked offline."""

from __future__ import annotations

import base64
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockDriveUploader, MockTokenExchanger
from jobsearch.engines.integration.google_drive import GOOGLE_DOC_MIME
from jobsearch.models import Provider
from jobsearch.models.common import utcnow

docx = pytest.importorskip("docx")  # build_docx needs python-docx (the "documents" extra)


def _app():
    state = AppState(exchanger=MockTokenExchanger(), drive_uploader=MockDriveUploader())
    return TestClient(create_app(state=state)), state


def _auth(client, email="drive@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "D"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}, _uid(tok)


def _uid(jwt: str) -> str:
    payload = jwt.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    return claims.get("sub") or claims.get("user_id") or ""


def _connect_drive(client, h) -> str:
    r = client.post("/api/v1/integrations/connect/google_drive", headers=h)
    assert r.status_code == 200, r.text
    url = r.json()["authorization_url"]
    oauth_state = r.json()["state"]
    cb = client.get("/api/v1/integrations/callback/google_drive",
                    params={"code": "auth-code", "state": oauth_state})
    assert cb.status_code == 200 and cb.json().get("connected") == "google_drive"
    return url


def _upload_cover_letter(client, h) -> str:
    body = b"Dear Hiring Manager,\nI cut incidents 40% and led a $2M migration. Sincerely, Sam."
    return client.post("/api/v1/cover-letters/upload", headers=h,
                       files={"file": ("cl.txt", body, "text/plain")}).json()["id"]


def _upload_resume(client, h) -> str:
    body = b"Sam Rivera\nSenior Engineer\n\nExperience\n- Built a payments service on FastAPI."
    return client.post("/api/v1/resumes/upload", headers=h,
                       files={"file": ("r.txt", body, "text/plain")}).json()["id"]


def test_connect_authorize_url_requests_drive_file_scope_offline():
    client, _ = _app()
    h, _ = _auth(client)
    url = _connect_drive(client, h)
    # least-privilege drive.file + offline so we get a refresh token
    assert "drive.file" in url
    assert "access_type=offline" in url


def test_open_in_google_docs_without_connection_returns_409():
    client, _ = _app()
    h, _ = _auth(client)
    cid = _upload_cover_letter(client, h)
    r = client.post(f"/api/v1/cover-letters/{cid}/open-in-google-docs", headers=h)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["error"] == "drive_not_connected"
    assert detail["connect_path"] == "/api/v1/integrations/connect/google_drive"


def test_open_cover_letter_in_google_docs_uploads_and_converts():
    client, state = _app()
    h, _ = _auth(client)
    _connect_drive(client, h)
    cid = _upload_cover_letter(client, h)

    r = client.post(f"/api/v1/cover-letters/{cid}/open-in-google-docs", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["web_view_link"].startswith("https://docs.google.com/document/")
    assert body["file_id"]

    # the uploader was handed REAL .docx bytes and the Google-Doc conversion target
    call = state.drive_uploader.calls[-1]
    assert call["target_mime"] == GOOGLE_DOC_MIME
    assert call["docx_bytes"][:2] == b"PK"  # .docx is a zip
    assert call["access_token"]  # a real (mock) Drive token was passed


def test_open_resume_in_google_docs_uploads_and_converts():
    client, state = _app()
    h, _ = _auth(client)
    _connect_drive(client, h)
    rid = _upload_resume(client, h)
    r = client.post(f"/api/v1/resumes/{rid}/open-in-google-docs", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["web_view_link"].startswith("https://docs.google.com/document/")
    assert state.drive_uploader.calls[-1]["docx_bytes"][:2] == b"PK"


def test_expired_drive_token_is_refreshed_then_uploads():
    client, state = _app()
    h, uid = _auth(client)
    assert uid, "could not decode user id from JWT"
    # Store an already-expired Drive token WITH a refresh token (as if connected a
    # while ago). get_access_token must refresh (mock) before uploading.
    state.integration.tokens.save(
        user_id=uid, provider=Provider.GOOGLE_DRIVE,
        access_token="old-access", refresh_token="refresh-token",
        expires_at=utcnow() - timedelta(hours=1),
    )
    cid = _upload_cover_letter(client, h)
    r = client.post(f"/api/v1/cover-letters/{cid}/open-in-google-docs", headers=h)
    assert r.status_code == 200, r.text
    # the refreshed (mock) access token, not the stale one, reached the uploader
    assert state.drive_uploader.calls[-1]["access_token"] != "old-access"


def test_open_in_google_docs_is_owner_scoped():
    client, _ = _app()
    ha, _ = _auth(client, "a@demo.com")
    hb, _ = _auth(client, "b@demo.com")
    _connect_drive(client, hb)  # B has Drive connected
    cid = _upload_cover_letter(client, ha)  # but the letter belongs to A
    # B cannot export A's document → 404 (not found for B), never A's content
    assert client.post(f"/api/v1/cover-letters/{cid}/open-in-google-docs", headers=hb).status_code == 404


def test_open_in_google_docs_requires_auth():
    client, _ = _app()
    assert client.post("/api/v1/cover-letters/anything/open-in-google-docs").status_code == 401
