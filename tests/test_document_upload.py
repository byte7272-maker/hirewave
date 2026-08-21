"""Résumé upload/download + using an uploaded file in a live submission."""

from __future__ import annotations

import base64
import email

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.storage import InMemoryDocumentStore, LocalDocumentStore


def _client(settings=None):
    st = AppState(settings=settings or Settings(), exchanger=MockTokenExchanger())
    return TestClient(create_app(state=st)), st


def _auth(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "sam@demo.com", "password": "supersecret", "full_name": "Sam"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# --- store round-trip -------------------------------------------------------
def test_local_document_store_roundtrip(tmp_path):
    store = LocalDocumentStore(str(tmp_path / "docs"))
    url = store.put("res_1", b"%PDF-1.4 data", content_type="application/pdf")
    assert url.startswith("file://")
    data, ct = store.get("res_1")
    assert data == b"%PDF-1.4 data"
    assert ct == "application/pdf"
    assert store.delete("res_1") is True
    assert store.get("res_1") is None


def test_memory_store_roundtrip():
    store = InMemoryDocumentStore()
    store.put("k", b"hi", content_type="text/plain")
    assert store.get("k") == (b"hi", "text/plain")


# --- upload / list / download ----------------------------------------------
def test_upload_lists_and_downloads():
    client, _ = _client()
    h = _auth(client)

    r = client.post(
        "/api/v1/resumes/upload",
        headers=h,
        files={"file": ("my_resume.pdf", b"%PDF-1.4 hello", "application/pdf")},
    )
    assert r.status_code == 201
    resume = r.json()
    assert resume["source"] == "uploaded"
    assert resume["format"] == "pdf"
    assert resume["original_filename"] == "my_resume.pdf"
    assert resume["file_url"] == f"/api/v1/resumes/{resume['id']}/file"

    # Shows up in the résumé list alongside generated ones.
    listed = client.get("/api/v1/resumes", headers=h).json()
    assert any(x["id"] == resume["id"] and x["source"] == "uploaded" for x in listed)

    # Download returns the exact bytes + filename.
    dl = client.get(f"/api/v1/resumes/{resume['id']}/file", headers=h)
    assert dl.status_code == 200
    assert dl.content == b"%PDF-1.4 hello"
    assert "my_resume.pdf" in dl.headers["content-disposition"]


def test_text_upload_keeps_preview():
    client, _ = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/resumes/upload",
        headers=h,
        files={"file": ("cv.md", b"# Sam\nPython, FastAPI", "text/markdown")},
    ).json()
    assert r["format"] == "markdown"
    assert "Python" in r["rendered_text"]  # text preview retained


def test_empty_upload_rejected():
    client, _ = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/resumes/upload", headers=h, files={"file": ("x.pdf", b"", "application/pdf")}
    )
    assert r.status_code == 400


def test_download_is_owner_scoped():
    client, _ = _client()
    h1 = _auth(client)
    resume = client.post(
        "/api/v1/resumes/upload",
        headers=h1,
        files={"file": ("r.pdf", b"secret", "application/pdf")},
    ).json()

    # A second user cannot download the first user's file.
    client.post(
        "/api/v1/auth/register",
        json={"email": "eve@demo.com", "password": "supersecret", "full_name": "Eve"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "eve@demo.com", "password": "supersecret"}
    ).json()
    h2 = {"Authorization": f"Bearer {tok['access_token']}"}
    assert client.get(f"/api/v1/resumes/{resume['id']}/file", headers=h2).status_code == 404


# --- uploaded file is attached in submission -------------------------------
def test_uploaded_file_is_attached_by_email_adapter(profile, matching_job):
    from jobsearch.engines.automation import (
        ApplicationContext,
        AutomationEngine,
        EmailAdapter,
    )
    from jobsearch.engines.generation import GenerationEngine
    from jobsearch.models import Application

    class FakeGmail:
        def __init__(self):
            self.sent = []

        def send_raw(self, token, raw):
            self.sent.append(raw)
            return {"id": "m1"}

    gen = GenerationEngine()
    resume = gen.generate_resume(profile, matching_job)
    cover = gen.generate_cover_letter(profile, matching_job, resume=resume)
    gen.approve(resume)
    gen.approve(cover)
    app = Application(user_id=profile.user_id, job_posting_id=matching_job.id, resume_id=resume.id)

    fake = FakeGmail()
    engine = AutomationEngine(adapters=[EmailAdapter(mode="live", gmail_client=fake)])
    ctx = ApplicationContext(
        application=app,
        job=matching_job,
        resume=resume,
        cover_letter=cover,
        profile=profile,
        access_token="tok",
        extra={
            "platform": "email",
            "to": "jobs@globex.com",
            "resume_file": {
                "filename": "alex_cv.pdf",
                "content_type": "application/pdf",
                "data": b"%PDF-1.4 real",
            },
        },
    )
    result = engine.submit(ctx)
    assert result.success is True

    msg = email.message_from_bytes(base64.urlsafe_b64decode(fake.sent[0]))
    names = [p.get_filename() for p in msg.walk() if p.get_filename()]
    assert "alex_cv.pdf" in names  # the real uploaded file, not resume.md
