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


def test_resume_preview_png():
    # A page-image preview renders from the résumé's extracted text (works for any
    # format we can extract). Returns a real PNG.
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload",
        headers=h,
        files={"file": ("cv.md", b"# Sam Rivera\nSenior IT Director\n- Led a 12-person team\n- Cut incidents 40%", "text/markdown")},
    ).json()["id"]
    img = client.get(f"/api/v1/resumes/{rid}/preview.png", headers=h)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic
    # owner-scoped: another user can't fetch it
    client.post("/api/v1/auth/register", json={"email": "eve@x.com", "password": "supersecret", "full_name": "Eve"})
    tok2 = client.post("/api/v1/auth/login", json={"email": "eve@x.com", "password": "supersecret"}).json()
    other = {"Authorization": f"Bearer {tok2['access_token']}"}
    assert client.get(f"/api/v1/resumes/{rid}/preview.png", headers=other).status_code == 404


def test_resume_list_carries_quality_grade_without_review():
    # The A-D card grade is cached on the résumé (computed cheaply, no LLM), so the
    # list endpoint returns it — the UI never fires a per-item review on list load.
    client, _ = _client()
    h = _auth(client)
    up = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"Sam Rivera - Senior IT Director\n- Led a team and cut incidents 40%\n- Delivered a $2M migration", "text/plain")},
    ).json()
    assert up["quality_grade"] in {"A", "B", "C", "D"}  # set at upload
    assert isinstance(up["quality_score"], int)
    listed = client.get("/api/v1/resumes", headers=h).json()
    assert listed[0]["quality_grade"] == up["quality_grade"]


def test_resume_preview_html_reflows_and_escapes():
    # A reflowable HTML preview (wraps to any width, native zoom) alongside the PNG.
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.md", b"# Sam <IT Director>\n- Led a team & cut incidents 40%", "text/markdown")},
    ).json()["id"]
    r = client.get(f"/api/v1/resumes/{rid}/preview.html", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "pre-wrap" in r.text  # reflows to any container width
    assert "&lt;IT Director&gt;" in r.text and "&amp;" in r.text  # user text is escaped
    # owner-scoped
    client.post("/api/v1/auth/register", json={"email": "z@x.com", "password": "supersecret", "full_name": "Z"})
    tok2 = client.post("/api/v1/auth/login", json={"email": "z@x.com", "password": "supersecret"}).json()
    other = {"Authorization": f"Bearer {tok2['access_token']}"}
    assert client.get(f"/api/v1/resumes/{rid}/preview.html", headers=other).status_code == 404


def test_resume_review_has_content_summary_and_ratings():
    # The review surfaces an AI content summary + a per-standard quality rating
    # breakdown with an overall letter grade, alongside the existing score.
    client, _ = _client()
    h = _auth(client)
    body = (
        b"Sam Rivera - Senior IT Director\n"
        b"- Led a 12-person team and cut incident volume 40%\n"
        b"- Delivered a $2M cloud migration on time\n"
        b"- Owned ITIL service delivery across 3 sites\n"
    )
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", body, "text/plain")},
    ).json()["id"]
    rv = client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={}).json()
    assert 0 <= rv["score"] <= 100
    assert rv["grade"] in {"A", "B", "C", "D"}
    assert rv["content_summary"]  # what the résumé says
    standards = {r["standard"] for r in rv["ratings"]}
    assert {"Impact & results", "Action language", "Keywords / ATS", "Structure", "Length"} <= standards
    for r in rv["ratings"]:
        assert 0 <= r["score"] <= 100 and r["grade"] in {"A", "B", "C", "D"} and r["note"]


def test_resume_tailor_shows_job_and_perspective():
    # The tailoring view echoes WHICH job, scores fit, and lists what to change —
    # so the revise flow always shows the target job + a qualifications perspective.
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"Backend engineer. Skills: Python, FastAPI, PostgreSQL, Docker. Led a team.", "text/plain")},
    ).json()["id"]
    jid = client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [{
        "source_platform": "linkedin", "title": "Senior Backend Engineer", "company": "Globex",
        "company_domain": "globex.com", "remote": True,
        "description": "Python FastAPI PostgreSQL AWS Kubernetes microservices",
        "requirements": ["Python", "AWS", "Kubernetes"],
        "salary_range": {"currency": "USD", "minimum": 120000, "maximum": 160000},
        "url": "https://linkedin.com/jobs/globex-1",
    }]}).json()
    # need the job id — fetch it from matches
    jid = next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == "Globex")

    t = client.post(f"/api/v1/resumes/{rid}/tailor", headers=h, json={"job_posting_id": jid})
    assert t.status_code == 200
    d = t.json()
    # WHICH job — the target job is echoed with display fields
    assert d["job"]["job_posting_id"] == jid
    assert d["job"]["title"] == "Senior Backend Engineer" and d["job"]["company"] == "Globex"
    assert d["job"]["salary_display"].startswith("$") and d["job"]["source_display"] == "LinkedIn"
    # perspective on qualifications + fit
    assert 0 <= d["fit_score"] <= 100
    assert d["qualifications"]
    assert "Python" in d["matching_skills"]  # already covered
    assert any(k in d["missing_keywords"] for k in ("AWS", "Kubernetes"))  # gaps vs this job
    # concrete changes to tailor it
    assert d["tailoring"] and all("title" in s and "detail" in s for s in d["tailoring"])


def test_resume_tailor_requires_valid_job():
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"Engineer. Python, FastAPI.", "text/plain")},
    ).json()["id"]
    assert client.post(f"/api/v1/resumes/{rid}/tailor", headers=h, json={"job_posting_id": "nope"}).status_code == 404


def test_resume_versions_switch_and_reuse():
    # Saving a rewrite creates a new active version (view follows it), history is
    # kept for a switcher, versions are labeled by job type, and a past version can
    # be reused for a similar new job.
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"Engineer. Skills: Python, SQL. Built pipelines.", "text/plain")},
    ).json()["id"]
    jids = {}
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [
        {"source_platform": "linkedin", "title": "Data Engineer", "company": "Globex", "company_domain": "g.com",
         "description": "Python SQL Spark", "requirements": ["Python", "SQL", "Spark"], "url": "https://x/1"},
        {"source_platform": "linkedin", "title": "Backend Engineer", "company": "Initech", "company_domain": "i.com",
         "description": "Python FastAPI AWS Kubernetes", "requirements": ["Python", "AWS", "Kubernetes"], "url": "https://x/2"},
    ]})
    for m in client.get("/api/v1/jobs/matches?limit=50", headers=h).json():
        jids[m["company"]] = m["job_id"]

    # save a version tailored for the backend role
    r = client.post(f"/api/v1/resumes/{rid}/versions", headers=h, json={
        "content": "Backend Engineer resume. Python, FastAPI, AWS, Kubernetes, microservices.",
        "job_posting_id": jids["Initech"], "instruction": "tailor for backend",
    }).json()
    assert r["active_version"] == 2  # original seeded as v1, this is v2
    labels = {v["version"]: v["label"] for v in r["versions"]}
    assert labels[1] == "Original" and labels[2]  # tailored version is labeled
    assert next(v for v in r["versions"] if v["version"] == 2)["change_summary"]  # summary of the change
    assert r["rendered_text"].startswith("Backend Engineer resume")  # view follows the new version

    # switch back to the original
    r = client.post(f"/api/v1/resumes/{rid}/versions/1/activate", headers=h).json()
    assert r["active_version"] == 1 and "Built pipelines" in r["rendered_text"]

    # reuse: for the Backend job, the backend-tailored version should be suggested
    reuse = client.get(f"/api/v1/resumes/{rid}/reuse?job_posting_id={jids['Initech']}", headers=h).json()
    assert reuse["best_version"] == 2 and reuse["reuse_recommended"] is True
    assert "AWS" in reuse["covered"] and reuse["fit"] >= 60
    assert reuse["recommendation"]


def test_revise_accepts_multiple_instructions():
    # The revise flow accepts several selected prompts at once (multi-select) and
    # applies them together; a single instruction still works; empty is rejected.
    client, _ = _client()
    h = _auth(client)
    rid = client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.txt", b"Engineer. Python, SQL. Built things.", "text/plain")},
    ).json()["id"]
    multi = client.post(f"/api/v1/resumes/{rid}/revise", headers=h,
                        json={"instructions": ["make it more concise", "emphasize leadership"]})
    assert multi.status_code == 200 and multi.json()["preview"]
    assert "make it more concise" in multi.json()["instruction"]
    assert "emphasize leadership" in multi.json()["instruction"]  # both applied
    single = client.post(f"/api/v1/resumes/{rid}/revise", headers=h, json={"instruction": "tighten it"})
    assert single.status_code == 200
    # a bare "Improve" (no prompt selected) still produces a rewrite (general improve)
    bare = client.post(f"/api/v1/resumes/{rid}/revise", headers=h, json={"instructions": []})
    assert bare.status_code == 200 and bare.json()["preview"]


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
