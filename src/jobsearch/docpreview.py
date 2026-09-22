"""Render an uploaded document to a preview PNG.

Universal and dependency-light: rasterizes a document's extracted text onto a
letter-proportioned "page" with Pillow. This is a faithful, format-agnostic
visual preview that works for PDF, DOCX, MD and TXT alike (a pixel-perfect render
of the original styling would need a headless office/print stack). Returns PNG
bytes, or ``None`` when Pillow is unavailable or there's no text to render.
"""

from __future__ import annotations

import html
import io
import re
from typing import Optional


def _inline_md(escaped: str) -> str:
    """Convert inline markdown in an already HTML-escaped string: **bold**, *italic*."""
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", escaped)
    escaped = re.sub(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", r"<em>\1</em>", escaped)
    return escaped


def markdown_to_html(text: str) -> str:
    """Render the small markdown subset the AI emits (headings, bullets, bold/italic,
    paragraphs) into clean HTML — so a résumé shows real formatting, not raw
    ``**asterisks**``. Everything is HTML-escaped first (safe to embed)."""
    out: list[str] = []
    para: list[str] = []
    bullets: list[str] = []

    def flush_para() -> None:
        if para:
            out.append("<p>" + "<br>".join(para) + "</p>")
            para.clear()

    def flush_bullets() -> None:
        if bullets:
            out.append("<ul>" + "".join(f"<li>{b}</li>" for b in bullets) + "</ul>")
            bullets.clear()

    for raw in (text or "").split("\n"):
        esc = html.escape(raw.rstrip()).strip()
        if not esc:
            flush_para()
            flush_bullets()
            continue
        h = re.match(r"(#{1,6})\s+(.*)", esc)
        if h:
            flush_para()
            flush_bullets()
            # Page title is h1; # and ## are the prominent section header (h2),
            # deeper levels step down. Résumés usually write sections as "## X".
            hashes = len(h.group(1))
            level = 2 if hashes <= 2 else min(hashes, 4)
            out.append(f"<h{level}>{_inline_md(h.group(2))}</h{level}>")
            continue
        b = re.match(r"(?:[-*]|•)\s+(.*)", esc)
        if b:
            flush_para()
            bullets.append(_inline_md(b.group(1)))
            continue
        flush_bullets()
        para.append(_inline_md(esc))
    flush_para()
    flush_bullets()
    return "\n".join(out)

# Letter aspect at ~100 dpi; `scale` multiplies for a crisper image.
_PAGE_W, _PAGE_H = 850, 1100
_MARGIN = 64
_LINE_PAD = 6


def render_text_preview(
    text: str, *, title: str = "", scale: int = 1
) -> Optional[bytes]:
    """Render ``text`` onto a single letter-size page and return PNG bytes.

    Wraps long lines to the page width and stops at the bottom margin (a preview
    is one page); a truncation note is drawn when content overflows. ``title`` is
    drawn as a heading (e.g. the file name). Returns ``None`` if the text is empty
    or Pillow isn't installed, so callers can 404 gracefully.
    """
    text = (text or "").strip()
    if not text:
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:  # noqa: BLE001 - Pillow not installed
        return None

    scale = max(1, min(int(scale or 1), 3))
    width, height = _PAGE_W * scale, _PAGE_H * scale
    margin = _MARGIN * scale
    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)

    def _font(size: int):
        size *= scale
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:  # noqa: BLE001 - font file not on the image
            try:
                return ImageFont.load_default(size=size)  # Pillow >= 10.1: scalable
            except TypeError:
                return ImageFont.load_default()

    body = _font(15)
    head = _font(21)
    max_w = width - 2 * margin

    def _line_height(font) -> int:
        box = draw.textbbox((0, 0), "Ag", font=font)
        return (box[3] - box[1]) + _LINE_PAD * scale

    def _wrap(line: str, font) -> list[str]:
        words = line.split(" ")
        out: list[str] = []
        cur = ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if not cur or draw.textlength(trial, font=font) <= max_w:
                cur = trial
            else:
                out.append(cur)
                cur = w
        if cur:
            out.append(cur)
        return out or [""]

    x = margin
    y = margin

    if title:
        hh = _line_height(head)
        for wline in _wrap(title, head):
            draw.text((x, y), wline, fill="#111111", font=head)
            y += hh
        y += _LINE_PAD * scale
        draw.line([(x, y), (width - margin, y)], fill="#dddddd", width=scale)
        y += _LINE_PAD * 2 * scale

    lh = _line_height(body)
    truncated = False
    for raw in text.splitlines():
        raw = raw.rstrip()
        if not raw:  # blank line = paragraph gap
            y += lh // 2
            continue
        for wline in _wrap(raw, body):
            if y + lh > height - margin:
                truncated = True
                break
            draw.text((x, y), wline, fill="#1a1a1a", font=body)
            y += lh
        if truncated:
            break

    if truncated:
        draw.text(
            (x, height - margin + _LINE_PAD * scale),
            "... preview truncated",
            fill="#888888",
            font=body,
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# A self-contained "document page" that REFLOWS to any width and can be magnified
# with native browser zoom / CSS transform (unlike the fixed-aspect PNG). The text
# is selectable and wraps, so it resizes width-wise cleanly.
_HTML_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light; }}
  html, body {{ margin: 0; }}
  body {{ background: #f3f4f6; padding: 16px; box-sizing: border-box;
         font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
  .page {{ width: 100%; max-width: 816px; margin: 0 auto; background: #fff; color: #1a1a1a;
          padding: 48px 56px; box-sizing: border-box; border-radius: 4px;
          box-shadow: 0 1px 6px rgba(0,0,0,.14); }}
  .page h1.doc-title {{ font-size: 22px; margin: 0 0 16px; padding-bottom: 10px;
                       border-bottom: 2px solid #2563eb; letter-spacing: .2px; }}
  .doc-body {{ word-wrap: break-word; overflow-wrap: anywhere; }}
  .doc-body h2 {{ font-size: 15px; text-transform: uppercase; letter-spacing: .6px;
                 color: #2563eb; margin: 20px 0 6px; padding-bottom: 3px;
                 border-bottom: 1px solid #e2e4e8; }}
  .doc-body h3 {{ font-size: 14px; margin: 14px 0 4px; }}
  .doc-body h4 {{ font-size: 13px; margin: 12px 0 4px; color: #444; }}
  .doc-body p {{ margin: 6px 0; }}
  .doc-body ul {{ margin: 6px 0 10px; padding-left: 22px; }}
  .doc-body li {{ margin: 3px 0; }}
  .doc-body strong {{ font-weight: 650; }}
  @media (prefers-color-scheme: dark) {{
    body {{ background: #111317; }}
    .page {{ background: #1b1e24; color: #e6e8ec; box-shadow: 0 1px 6px rgba(0,0,0,.5); }}
    .page h1.doc-title {{ border-bottom-color: #3b82f6; }}
    .doc-body h2 {{ color: #7aa2ff; border-bottom-color: #2c313a; }}
    .doc-body h4 {{ color: #aab2c0; }}
  }}
</style></head>
<body><article class="page"><h1 class="doc-title">{title}</h1><div class="doc-body">{body}</div></article></body></html>"""


def render_text_html(text: str, *, title: str = "") -> Optional[str]:
    """Render document text as a standalone, reflowable HTML page (returns the HTML
    string, or ``None`` when there's no text). Unlike the PNG, this wraps to any
    container width and magnifies with native zoom, so the viewer can add real
    fit-width / magnify controls. Text is HTML-escaped (safe to embed)."""
    text = (text or "").strip()
    if not text:
        return None
    return _HTML_TEMPLATE.format(
        title=html.escape(title or "Document"),
        body=markdown_to_html(text),
    )


def _docx_runs(paragraph, text: str) -> None:
    """Add a markdown line to a python-docx paragraph, honoring **bold**."""
    text = re.sub(r"[*_]{1}(?=\S)(.+?)(?<=\S)[*_]{1}", r"\1", text)  # drop stray italics markers
    parts = re.split(r"\*\*(.+?)\*\*", text)
    for i, part in enumerate(parts):
        if not part:
            continue
        run = paragraph.add_run(part)
        if i % 2 == 1:  # captured groups (between **) are bold
            run.bold = True


def build_docx(text: str, *, title: str = "") -> Optional[bytes]:
    """Build a clean, professionally-formatted Word (.docx) document from the
    markdown-ish content: a title, section headings, bullet lists, and bold text in a
    standard font. Returns the .docx bytes, or None if python-docx is unavailable /
    there's no text. This is a fresh formatted document, not the original file."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        from docx import Document
        from docx.shared import Pt
    except Exception:  # noqa: BLE001 - python-docx not installed
        return None

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    if title:
        doc.add_heading(title, level=0)

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            continue
        h = re.match(r"(#{1,6})\s+(.*)", s)
        if h:
            doc.add_heading(re.sub(r"\*\*", "", h.group(2)), level=min(len(h.group(1)), 4))
            continue
        b = re.match(r"(?:[-*]|•)\s+(.*)", s)
        if b:
            _docx_runs(doc.add_paragraph(style="List Bullet"), b.group(1))
            continue
        _docx_runs(doc.add_paragraph(), s)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pdf_text(s: str) -> str:
    """Strip inline markdown markers for a plain PDF run (fpdf core fonts are latin-1)."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"[*_`]", "", s)
    return s.encode("latin-1", "replace").decode("latin-1")


def build_pdf(text: str, *, title: str = "") -> Optional[bytes]:
    """Build a clean, professionally-formatted PDF from the markdown-ish content:
    a title, section headings, and bullet lists in a standard font. Pure-Python
    (fpdf2), no system dependencies. Returns PDF bytes, or None if unavailable/empty."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        from fpdf import FPDF
    except Exception:  # noqa: BLE001 - fpdf2 not installed
        return None

    pdf = FPDF(format="letter", unit="pt")
    pdf.set_auto_page_break(auto=True, margin=54)
    pdf.set_margins(54, 54, 54)
    pdf.add_page()
    width = pdf.epw  # effective page width

    if title:
        pdf.set_font("Helvetica", "B", 18)
        pdf.multi_cell(width, 22, _pdf_text(title))
        pdf.ln(2)
        pdf.set_draw_color(37, 99, 235)
        pdf.set_line_width(1.2)
        y = pdf.get_y()
        pdf.line(54, y, 54 + width, y)
        pdf.ln(8)

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            pdf.ln(4)
            continue
        h = re.match(r"(#{1,6})\s+(.*)", s)
        if h:
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(37, 99, 235)
            pdf.multi_cell(width, 16, _pdf_text(h.group(2).upper()))
            pdf.set_text_color(20, 20, 20)
            pdf.ln(1)
            continue
        b = re.match(r"(?:[-*]|\u2022)\s+(.*)", s)
        if b:
            pdf.set_font("Helvetica", "", 10.5)
            pdf.set_x(64)
            pdf.multi_cell(width - 10, 14, "-  " + _pdf_text(b.group(1)))
            continue
        bold = s.startswith("**") and s.endswith("**")
        pdf.set_font("Helvetica", "B" if bold else "", 10.5)
        pdf.multi_cell(width, 14, _pdf_text(s))

    out = pdf.output()
    return bytes(out)
