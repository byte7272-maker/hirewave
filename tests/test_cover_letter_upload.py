"""Upload / list / download / delete of the user's own cover-letter files."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="cl@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "CL"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_upload_list_download_delete():
    client = _client()
    h = _auth(client)
    body = b"Dear Hiring Manager,\nI am excited to apply for this role. Sincerely, Sam."
    r = client.post(
        "/api/v1/cover-letters/upload",
        headers=h,
        files={"file": ("cover.md", body, "text/markdown")},
    )
    assert r.status_code == 201
    cl = r.json()
    assert cl["source"] == "uploaded"
    assert cl["original_filename"] == "cover.md"
    assert "excited to apply" in cl["content"]  # text extracted
    assert cl["file_url"].endswith("/file")
    assert cl["job_posting_id"] is None  # generic letter, no job

    # list
    lst = client.get("/api/v1/cover-letters", headers=h).json()
    assert len(lst) == 1 and lst[0]["id"] == cl["id"]

    # download the exact bytes
    got = client.get(f"/api/v1/cover-letters/{cl['id']}/file", headers=h)
    assert got.status_code == 200 and got.content == body

    # delete
    assert client.delete(f"/api/v1/cover-letters/{cl['id']}", headers=h).status_code == 204
    assert client.get("/api/v1/cover-letters", headers=h).json() == []


def test_upload_empty_rejected():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/cover-letters/upload", headers=h, files={"file": ("c.txt", b"", "text/plain")})
    assert r.status_code == 400


def test_upload_unknown_job_404():
    client = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/cover-letters/upload",
        headers=h,
        files={"file": ("c.txt", b"hello cover letter", "text/plain")},
        data={"job_posting_id": "nope"},
    )
    assert r.status_code == 404


def test_cover_letters_owner_scoped_and_auth():
    client = _client()
    assert client.get("/api/v1/cover-letters").status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    cl = client.post(
        "/api/v1/cover-letters/upload",
        headers=ha,
        files={"file": ("c.txt", b"A's private cover letter text", "text/plain")},
    ).json()
    assert client.get("/api/v1/cover-letters", headers=hb).json() == []
    assert client.get(f"/api/v1/cover-letters/{cl['id']}/file", headers=hb).status_code == 404
    assert client.delete(f"/api/v1/cover-letters/{cl['id']}", headers=hb).status_code == 404
