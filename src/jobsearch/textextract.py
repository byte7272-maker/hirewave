"""Best-effort text extraction from uploaded résumé files.

Text formats are decoded directly; PDF/DOCX use pypdf / python-docx (the
``documents`` extra) and degrade gracefully to ``""`` if the libraries are
absent or the file can't be parsed — callers fall back to the structured
profile. The extracted text feeds the ATS preview and interview prep.
"""

from __future__ import annotations

import io
import re

_TEXT_EXTS = {"txt", "md", "markdown"}


def _docx_runs_md(para) -> str:
    """One paragraph's text as markdown, preserving bold/italic from its runs."""
    out = []
    for run in para.runs:
        t = run.text
        if not t:
            continue
        if run.bold and run.italic:
            t = f"***{t}***"
        elif run.bold:
            t = f"**{t}**"
        elif run.italic:
            t = f"*{t}*"
        out.append(t)
    text = "".join(out).strip()
    return text or (para.text or "").strip()


def _docx_para_md(para) -> str:
    """Convert a docx paragraph to a markdown block: headings → #, list items → -,
    otherwise plain text (with inline bold/italic)."""
    text = _docx_runs_md(para)
    if not text:
        return ""
    style = (getattr(para.style, "name", "") or "").lower()
    if style.startswith("title"):
        return "# " + text
    if style.startswith("heading"):
        m = re.search(r"(\d+)", style)
        level = min(int(m.group(1)), 6) if m else 2
        return ("#" * max(1, level)) + " " + text
    is_list = "list" in style
    try:  # numbered/bulleted paragraphs via numbering properties
        if para._p.pPr is not None and para._p.pPr.numPr is not None:
            is_list = True
    except Exception:  # noqa: BLE001
        pass
    return ("- " + text) if is_list else text


def _docx_table_md(table) -> str:
    """A table's cell content as markdown blocks (preserve the text even if the exact
    2-D layout is lost — résumés often use tables for layout). Dedupes merged cells."""
    blocks = []
    for row in table.rows:
        prev = None
        for cell in row.cells:
            cmd = "\n\n".join(m for p in cell.paragraphs if (m := _docx_para_md(p)))
            cmd = cmd.strip()
            if cmd and cmd != prev:
                blocks.append(cmd)
                prev = cmd
    return "\n\n".join(blocks)


def _docx_to_markdown(data: bytes) -> str:
    """Extract a .docx as structured markdown (headings, bold, bullets, tables) in
    document order — NOT a flat paragraph dump (which drops formatting + table text)."""
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = docx.Document(io.BytesIO(data))
    blocks: list[str] = []
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            md = _docx_para_md(Paragraph(child, document))
            if md:
                blocks.append(md)
        elif tag == "tbl":
            md = _docx_table_md(Table(child, document))
            if md:
                blocks.append(md)
    return re.sub(r"\n{3,}", "\n\n", "\n\n".join(blocks)).strip()


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def extract_text(data: bytes, *, filename: str = "", content_type: str = "") -> str:
    ext = _ext(filename)
    if ext in _TEXT_EXTS or content_type.startswith("text/"):
        return data.decode("utf-8", errors="replace")

    if ext == "pdf" or content_type == "application/pdf":
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(data))
            return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        except Exception:  # noqa: BLE001 - missing lib or unparseable file
            return ""

    if ext in {"docx"} or content_type.endswith("wordprocessingml.document"):
        try:
            return _docx_to_markdown(data)
        except Exception:  # noqa: BLE001 - missing lib or unparseable file
            return ""

    # Unknown binary format — try a lenient decode, else give up.
    try:
        text = data.decode("utf-8")
        return text if text.isprintable() or "\n" in text else ""
    except UnicodeDecodeError:
        return ""
