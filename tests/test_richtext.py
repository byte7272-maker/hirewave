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


def test_sanitize_keeps_font_and_valid_color():
    html = '<span style="font-family: Arial; font-size: 14px; color: #ff0000">x</span>'
    clean = sanitize_html(html)
    assert "font-family" in clean and "font-size" in clean
    assert "color: #ff0000" in clean  # colour round-trips (user's choice to keep)


def test_sanitize_rejects_unsafe_color_but_keeps_rgb():
    # A url()/expression masquerading as a colour must not survive.
    bad = sanitize_html('<span style="color: url(javascript:x)">x</span>')
    assert "javascript" not in bad.lower() and "url(" not in bad.lower()
    # rgb() is a legitimate colour and is kept verbatim.
    good = sanitize_html('<span style="color: rgb(10,20,30)">x</span>')
    assert "rgb(10,20,30)" in good


def test_strip_colors_standardizes_for_ats():
    from jobsearch.richtext import has_colors, strip_colors

    html = '<p><span style="color: #c00; font-size: 12pt">Red bold text</span></p>'
    assert has_colors(html) is True
    clean = strip_colors(html)
    assert "color" not in clean.lower()
    assert "font-size" in clean  # other formatting kept
    assert has_colors(clean) is False


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


def test_build_docx_applies_text_color():
    docx = pytest.importorskip("docx")
    from jobsearch.docpreview import build_docx

    html = '<p><span style="color: #ff0000">Red</span> and plain.</p>'
    data = build_docx("x", content_html=html)
    import io
    doc = docx.Document(io.BytesIO(data))
    runs = [r for p in doc.paragraphs for r in p.runs]
    red = next(r for r in runs if r.text == "Red")
    assert red.font.color is not None and str(red.font.color.rgb) == "FF0000"


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


def _make_docx_bytes() -> bytes:
    docx = pytest.importorskip("docx")
    import io
    d = docx.Document()
    d.add_heading("Bayete Williams", level=1)
    p = d.add_paragraph()
    p.add_run("Dear Hiring Manager,")
    body = d.add_paragraph()
    body.add_run("I ").bold = False
    body.add_run("led").italic = True
    body.add_run(" a team that shipped.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_docx_to_html_preserves_structure():
    pytest.importorskip("docx")
    from jobsearch.richtext import docx_to_html

    html = docx_to_html(_make_docx_bytes())
    assert "<h1>" in html and "Bayete Williams" in html
    assert "Dear Hiring Manager" in html
    assert "<em>led</em>" in html  # italic run preserved
    assert "<script" not in html.lower()  # output is sanitized


def test_docx_upload_seeds_content_html():
    client = _client()
    h = _auth(client, email="seed@demo.com")
    r = client.post("/api/v1/cover-letters/upload", headers=h, files={
        "file": ("letter.docx", _make_docx_bytes(),
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    })
    assert r.status_code == 201, r.text
    cl = r.json()
    # The Working copy opens already formatted: content_html seeded from the .docx.
    assert "Bayete Williams" in cl["content_html"]
    assert "<em>led</em>" in cl["content_html"]
    # The Original version carries it too (so switching back shows the formatting).
    orig = next(v for v in cl["versions"] if v["version"] == 1)
    assert "Bayete Williams" in orig["content_html"]
    # Plain text (AI/ATS) is still populated and unaffected.
    assert "Dear Hiring Manager" in cl["content"]


def test_txt_upload_has_no_content_html():
    client = _client()
    h = _auth(client, email="plain@demo.com")
    r = client.post("/api/v1/cover-letters/upload", headers=h, files={
        "file": ("letter.txt", b"Dear Team, hello. Sincerely, Sam.", "text/plain"),
    })
    assert r.status_code == 201
    assert r.json()["content_html"] == ""  # text upload stays on the text path


def test_version_keeps_color_by_default_and_standardizes_on_request():
    client = _client()
    h = _auth(client, email="color@demo.com")
    cid = client.post("/api/v1/cover-letters/upload", headers=h,
                      files={"file": ("cl.txt", b"Dear Team, hi. Sincerely, Sam.",
                                      "text/plain")}).json()["id"]
    colored = '<p><span style="color: #c00000">Keep me red</span></p>'
    # Default: colour is kept (the user chose to keep it).
    keep = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                       json={"content_html": colored}).json()
    assert "color" in keep["content_html"].lower()
    # Standardize for ATS: same HTML, colour stripped, other formatting intact.
    std = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                      json={"content_html": colored, "standardize": True}).json()
    assert "color" not in std["content_html"].lower()
    assert "Keep me red" in std["content_html"]


def test_version_requires_some_content():
    client = _client()
    h = _auth(client)
    cid = client.post("/api/v1/cover-letters/upload", headers=h,
                      files={"file": ("cl.txt", b"Dear Team, hello. Sincerely, Sam.",
                                      "text/plain")}).json()["id"]
    r = client.post(f"/api/v1/cover-letters/{cid}/versions", headers=h,
                    json={"content_html": "   "})
    assert r.status_code == 400
