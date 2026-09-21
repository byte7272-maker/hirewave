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
from typing import Optional

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
  .page h1.doc-title {{ font-size: 20px; margin: 0 0 14px; padding-bottom: 10px;
                       border-bottom: 1px solid #e2e4e8; }}
  .page .doc-body {{ white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere; }}
  @media (prefers-color-scheme: dark) {{
    body {{ background: #111317; }}
    .page {{ background: #1b1e24; color: #e6e8ec; box-shadow: 0 1px 6px rgba(0,0,0,.5); }}
    .page h1.doc-title {{ border-bottom-color: #2c313a; }}
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
        body=html.escape(text),
    )
