"""DOCX extraction must preserve structure as markdown — headings, bold, bullets, and
table content (résumés often use tables for layout) — not flatten to plain text."""

from __future__ import annotations

import io

import pytest

from jobsearch.textextract import extract_text

docx = pytest.importorskip("docx")  # python-docx (the "documents" extra)


def _build_docx() -> bytes:
    d = docx.Document()
    d.add_heading("Experience", level=2)
    p = d.add_paragraph()
    p.add_run("Senior Engineer").bold = True
    p.add_run(" at Globex")
    d.add_paragraph("Led a team of five", style="List Bullet")
    d.add_paragraph("Shipped the billing platform", style="List Bullet")
    t = d.add_table(rows=1, cols=2)
    t.cell(0, 0).text = "Name: Mason Attmore"
    t.cell(0, 1).text = "Email: mason@example.com"
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_docx_extract_preserves_structure_as_markdown():
    md = extract_text(_build_docx(), filename="resume.docx")
    # heading preserved as markdown (## for Heading 2)
    assert "## Experience" in md
    # bold run preserved
    assert "**Senior Engineer**" in md and "at Globex" in md
    # bullets preserved
    assert "- Led a team of five" in md
    assert "- Shipped the billing platform" in md
    # TABLE content preserved (the old extractor dropped this entirely)
    assert "Name: Mason Attmore" in md
    assert "Email: mason@example.com" in md


def test_docx_extract_is_not_a_flat_dump():
    # The old behavior ("\n".join(p.text ...)) would have NO markdown markers and NO table
    # text. Assert we are not doing that.
    md = extract_text(_build_docx(), filename="resume.docx")
    assert md.count("#") >= 1 and md.count("*") >= 2  # structure, not flat text
