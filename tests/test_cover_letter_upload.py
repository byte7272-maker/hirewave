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


def test_cover_letter_list_carries_quality_grade_without_review():
    # The A-D card grade is cached on the letter (no LLM), so the list endpoint
    # returns it without firing a per-item review.
    client = _client()
    h = _auth(client, "clgrade@demo.com")
    up = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("c.txt", b"Dear Hiring Manager, I cut incidents 40% and led a $2M migration. Sincerely, Sam.", "text/plain")},
    ).json()
    assert up["quality_grade"] in {"A", "B", "C", "D"}
    assert isinstance(up["quality_score"], int)
    listed = client.get("/api/v1/cover-letters", headers=h).json()
    assert listed[0]["quality_grade"] == up["quality_grade"]


def test_cover_letter_preview_html():
    client = _client()
    h = _auth(client, "clhtml@demo.com")
    cid = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cl.txt", b"Dear team, I am keen to apply. Sincerely, Sam.", "text/plain")},
    ).json()["id"]
    r = client.get(f"/api/v1/cover-letters/{cid}/preview.html", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "keen to apply" in r.text and "<p>" in r.text  # rendered as formatted HTML


def test_cover_letter_preview_png_and_review_enriched():
    # Parity with résumés: a PNG page-image preview + a review that carries an AI
    # content summary and a per-standard quality rating breakdown with a grade.
    client = _client()
    h = _auth(client, "clprev@demo.com")
    body = (
        b"Dear Hiring Manager,\n"
        b"I am excited to apply for the IT Director role. In my last role I cut incidents 40% "
        b"and delivered a $2M migration on time. Sincerely, Sam.\n"
    )
    cid = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cover.txt", body, "text/plain")},
    ).json()["id"]

    img = client.get(f"/api/v1/cover-letters/{cid}/preview.png", headers=h)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content[:8] == b"\x89PNG\r\n\x1a\n"

    rv = client.post(f"/api/v1/cover-letters/{cid}/review", headers=h, json={}).json()
    assert 0 <= rv["score"] <= 100 and rv["grade"] in {"A", "B", "C", "D"}
    assert rv["content_summary"]
    standards = {r["standard"] for r in rv["ratings"]}
    assert {"Length", "Specificity & impact", "Personalization", "Clarity", "Structure"} <= standards
    for r in rv["ratings"]:
        assert 0 <= r["score"] <= 100 and r["grade"] in {"A", "B", "C", "D"} and r["note"]

    # preview is owner-scoped
    hb = _auth(client, "clprev2@demo.com")
    assert client.get(f"/api/v1/cover-letters/{cid}/preview.png", headers=hb).status_code == 404


def test_cover_letter_tailor_shows_job_and_perspective():
    # Parity with résumés: the tailoring view echoes WHICH job, scores how well the
    # letter targets it, and lists what to change.
    client = _client()
    h = _auth(client, "cltailor@demo.com")
    cid = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cl.txt", b"Dear Hiring Manager, I am excited to apply. I have strong Python experience and cut latency 30%. Sincerely, Sam.", "text/plain")},
    ).json()["id"]
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [{
        "source_platform": "linkedin", "title": "Backend Engineer", "company": "Globex",
        "company_domain": "globex.com", "remote": True, "description": "Python FastAPI AWS Kubernetes",
        "requirements": ["Python", "AWS", "Kubernetes"], "url": "https://linkedin.com/jobs/g-1",
    }]})
    jid = next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == "Globex")

    t = client.post(f"/api/v1/cover-letters/{cid}/tailor", headers=h, json={"job_posting_id": jid})
    assert t.status_code == 200
    d = t.json()
    assert d["job"]["job_posting_id"] == jid and d["job"]["company"] == "Globex"
    assert 0 <= d["fit_score"] <= 100
    assert "Python" in d["addressed"]
    assert any(k in d["missing_points"] for k in ("AWS", "Kubernetes"))
    assert d["qualifications"]
    assert d["tailoring"] and all("title" in s for s in d["tailoring"])
    # requires a valid job
    assert client.post(f"/api/v1/cover-letters/{cid}/tailor", headers=h, json={"job_posting_id": "nope"}).status_code == 404


def test_cover_letter_versions_and_reuse():
    # Parity with résumés: save a new version (view follows), keep history, reuse.
    client = _client()
    h = _auth(client, "clver@demo.com")
    cid = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cl.txt", b"Dear Hiring Manager, I am interested. Sincerely, Sam.", "text/plain")},
    ).json()["id"]
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [{
        "source_platform": "linkedin", "title": "Backend Engineer", "company": "Initech", "company_domain": "i.com",
        "description": "Python AWS", "requirements": ["Python", "AWS"], "url": "https://x/9"}]})
    jid = next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == "Initech")

    r = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h, json={
        "content": "Dear Initech team, my Python and AWS experience fits your Backend Engineer role. Sincerely, Sam.",
        "job_posting_id": jid, "instruction": "tailor for Initech backend role",
    }).json()
    assert r["active_version"] == 2 and r["content"].startswith("Dear Initech")
    assert {v["version"] for v in r["versions"]} == {1, 2}

    r = client.post(f"/api/v1/cover-letters/{cid}/versions/1/activate", headers=h).json()
    assert r["active_version"] == 1

    reuse = client.get(f"/api/v1/cover-letters/{cid}/reuse?job_posting_id={jid}", headers=h).json()
    assert reuse["best_version"] == 2 and "Python" in reuse["covered"]


def test_cover_letter_structured_and_improve():
    # Structure-aware Improve for cover letters (mirrors résumé): parse into the
    # template shape, improve as that shape, save via /versions.
    client = _client()
    h = _auth(client, "clstruct@demo.com")
    body = b"Dear Hiring Manager,\n\nI am excited to apply for the IT Director role at Globex. I cut incidents 40%.\n\nSincerely,\nSam Rivera"
    cid = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cl.txt", body, "text/plain")},
    ).json()["id"]

    s = client.get(f"/api/v1/cover-letters/{cid}/structured", headers=h).json()
    assert {"name", "contact", "date", "company", "role", "salutation", "paragraphs", "closing", "signature"} == set(s.keys())
    assert s["salutation"].startswith("Dear") and s["paragraphs"]

    imp = client.post(f"/api/v1/cover-letters/{cid}/improve-structured", headers=h,
                      json={"instructions": ["add a concrete result"]}).json()
    assert {"structured", "markdown", "flagged_metrics"} <= set(imp.keys())
    assert imp["markdown"] and isinstance(imp["flagged_metrics"], list)

    v = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h, json={"content": imp["markdown"]})
    assert v.status_code == 200 and v.json()["active_version"] == 2


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
