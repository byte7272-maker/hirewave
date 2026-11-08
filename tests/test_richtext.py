"""Rich-text (word-processor) editing — Option B.

Sanitization (XSS allowlist), the plain-text projection the AI/ATS read, the
HTML->docx export path, and the versions endpoint accepting ``content_html``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.richtext import html_to_blocks, html_to_text, sanitize_html


# --- sanitize ---------------------------------------------------------------

def test_sanitize_strips_script_and_event_handlers():
    dirty = '<p onclick="steal()">Hi</p><script>alert(1)</script>'
    clean = sanitize_html(dirty)
    assert "<script" not in clean.lower()
    assert "alert(1)" not in clean  # script text content dropped
    assert "onclick" not in clean.lower()
    assert "Hi" in clean


def test_sanitize_drops_javascript_href_keeps_safe_links():
    assert "javascript:" not in sanitize_html('<a href="javascript:x()">x</a>').lower()
    keep = sanitize_html('<a href="https://example.com">site</a>')
    assert 'href="https://example.com"' in keep
    assert sanitize_html('<a href="mailto:a@b.com">mail</a>').count("mailto:") == 1


def test_sanitize_keeps_font_but_drops_color_in_v1():
    html = '<span style="font-family: Arial; font-size: 14px; color: red">x</span>'
    clean = sanitize_html(html)
    assert "font-family" in clean and "font-size" in clean
    assert "color" not in clean.lower()  # colour is intentionally not in the v1 allowlist


def test_sanitize_rejects_style_with_css_function():
    clean = sanitize_html('<span style="font-family: url(javascript:x)">x</span>')
    assert "url(" not in clean.lower()


def test_sanitize_unknown_tag_keeps_text():
    clean = sanitize_html("<div><marquee>keep me</marquee></div>")
    assert "keep me" in clean
    assert "<marquee" not in clean.lower()


# --- text projection --------------------------------------------------------

def test_html_to_text_derives_markdownish():
    html = ("<h1>Title</h1><p>Hello <strong>world</strong> and <em>you</em>.</p>"
            "<ul><li>one</li><li>two</li></ul>")
    text = html_to_text(html)
    assert "# Title" in text
    assert "**world**" in text
    assert "*you*" in text
    assert "- one" in text and "- two" in text


def test_html_to_blocks_tracks_formatting():
    blocks = html_to_blocks('<p><strong>bold</strong> plain</p>')
    runs = blocks[0].runs
    assert any(r.bold and r.text == "bold" for r in runs)
    assert any((not r.bold) and "plain" in r.text for r in runs)


def test_html_to_text_empty():
    assert html_to_text("") == ""
    assert sanitize_html("   ") == ""


# --- docx export from html --------------------------------------------------

def test_build_docx_from_html_renders_formatting():
    docx = pytest.importorskip("docx")  # needs python-docx
    from jobsearch.docpreview import build_docx

    html = ('<h1>Cover Letter</h1>'
            '<p style="text-align:center">Dear <strong>Hiring Manager</strong>,</p>'
            '<p><span style="font-family: Georgia; font-size: 13px">I '
            '<em>led</em> a team.</span></p>')
    data = build_docx("fallback text", content_html=html, title="CL")
    assert data is not None and data[:2] == b"PK"  # a real .docx (zip)

    # Re-open and confirm the rich formatting survived the mapping.
    import io
    doc = docx.Document(io.BytesIO(data))
    full = "\n".join(p.text for p in doc.paragraphs)
    assert "Hiring Manager" in full and "led a team" in full
    runs = [r for p in doc.paragraphs for r in p.runs]
    assert any(r.bold and "Hiring Manager" in r.text for r in runs)
    assert any(r.italic and r.text == "led" for r in runs)
    assert any((r.font.name or "") == "Georgia" for r in runs)


def test_build_docx_falls_back_to_markdown_when_no_html():
    pytest.importorskip("docx")
    from jobsearch.docpreview import build_docx

    data = build_docx("# Heading\n\nA plain paragraph.", content_html="")
    assert data is not None and data[:2] == b"PK"


# --- endpoint: save a version with content_html -----------------------------

def _client():
    return TestClient(create_app(state=AppState()))


def _auth(client, email="rich@demo.com"):
    client.post("/api/v1/auth/register",
                json={"email": email, "password": "supersecret12", "full_name": "R"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": email, "password": "supersecret12"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_cover_letter_version_accepts_content_html_and_derives_text():
    client = _client()
    h = _auth(client)
    cid = client.post("/api/v1/cover-letters/upload", headers=h,
                      files={"file": ("cl.txt", b"Dear Team, I built things. Sincerely, Sam.",
                                      "text/plain")}).json()["id"]
    html = ('<p>Dear Hiring Manager,</p><p>I <strong>cut costs</strong> and '
            '<script>alert(1)</script> shipped.</p>')
    r = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                    json={"content_html": html})
    assert r.status_code == 200, r.text
    cl = r.json()
    # Rich HTML is stored (sanitized), and the plain-text projection is derived.
    assert "cut costs" in cl["content_html"]
    assert "<script" not in cl["content_html"].lower()
    assert "**cut costs**" in cl["content"]  # derived markdown-ish text (AI/ATS read this)
    assert "alert(1)" not in cl["content"]


def test_export_docx_uses_rich_html_when_present():
    pytest.importorskip("docx")
    client = _client()
    h = _auth(client)
    cid = client.post("/api/v1/cover-letters/upload", headers=h,
                      files={"file": ("cl.txt", b"Dear Team, hello. Sincerely, Sam.",
                                      "text/plain")}).json()["id"]
    client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                json={"content_html": "<p>Dear Hiring Manager,</p><p><strong>Bold</strong> body.</p>"})
    exp = client.get(f"/api/v1/cover-letters/{cid}/export.docx", headers=h)
    assert exp.status_code == 200
    assert exp.content[:2] == b"PK"


def test_version_requires_some_content():
    client = _client()
    h = _auth(client)
    cid = client.post("/api/v1/cover-letters/upload", headers=h,
                      files={"file": ("cl.txt", b"Dear Team, hello. Sincerely, Sam.",
                                      "text/plain")}).json()["id"]
    r = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                    json={"content_html": "   "})
    assert r.status_code == 400
