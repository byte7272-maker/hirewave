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

# Inline HTML that can leak into résumé/cover-letter text (e.g. a DOCX email hyperlink
# extracts as <a href="mailto:x">x</a>). Rendered as markdown it shows as raw code, so
# we flatten anchors to their visible text and drop a few stray inline tags.
_ANCHOR_RE = re.compile(r"<a\b[^>]*>(.*?)</a>", re.I | re.S)
_MAILTO_HREF_RE = re.compile(r'href\s*=\s*["\']\s*mailto:([^"\']+)["\']', re.I)
_BR_RE = re.compile(r"<br\s*/?>", re.I)
_INLINE_TAG_RE = re.compile(r"</?(?:span|strong|em|u|b|i|font|small|sub|sup|mark|p|div)\b[^>]*>", re.I)


def strip_inline_html(text: str) -> str:
    """Flatten inline HTML that shouldn't appear in a plain/markdown résumé.

    ``<a href="mailto:x">x</a>`` -> ``x`` (so an email renders as text, not code), other
    anchors -> their link text (or the URL if empty), ``<br>`` -> newline, and a few stray
    inline formatting tags removed. Leaves real markdown (``**bold**``) and plain ``<`` /
    ``>`` comparisons untouched. Idempotent."""
    if not text or "<" not in text:
        return text or ""

    def _anchor(m: "re.Match") -> str:
        inner = _INLINE_TAG_RE.sub("", m.group(1) or "").strip()
        if inner:
            return inner
        href = _MAILTO_HREF_RE.search(m.group(0))
        return href.group(1).strip() if href else ""

    out = _ANCHOR_RE.sub(_anchor, text)
    out = _BR_RE.sub("\n", out)
    out = _INLINE_TAG_RE.sub("", out)
    return out


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
