"""Rich-text (word-processor) content handling for the Working copy (Option B).

Three jobs, all pure-Python (no new dependency — the editor emits a small, known
HTML subset, so a stdlib allowlist is safer and lighter than passthrough):

* ``sanitize_html`` — allowlist the editor's HTML on save (prevents stored XSS).
* ``html_to_text`` — derive the plain-text / light-markdown projection the AI,
  ATS scoring, review and matching read (so the rich layer never changes them).
* ``html_to_blocks`` — parse the HTML into blocks + formatted runs, which
  ``docpreview.build_docx`` maps to a real .docx (fonts, size, bold/italic/…).

Formatting: bold, italic, underline, strikethrough, font family, font size,
**text color / highlight**, headings, alignment, line spacing, lists, links.
Colour round-trips; ``strip_colors`` (and the versions endpoint's ``standardize``
flag) removes it to produce an ATS-safe document when the user chooses to
standardize an imported, coloured file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html import escape, unescape
from html.parser import HTMLParser
from typing import Optional

# --- allowlists --------------------------------------------------------------

#: Block/inline tags the editor is allowed to emit. Anything else is dropped
#: (its text content is kept). ``br`` is the only void element.
_ALLOWED_TAGS = {
    "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "strike",
    "del", "ul", "ol", "li", "a", "span", "blockquote",
}
_VOID_TAGS = {"br"}

#: CSS properties kept from a ``style`` attribute.
_ALLOWED_STYLE_PROPS = {
    "font-family", "font-size", "font-weight", "font-style",
    "text-decoration", "text-align", "line-height", "color", "background-color",
}
#: Colour properties — kept unless the caller standardizes for ATS.
_COLOR_PROPS = {"color", "background-color"}

_SAFE_URL_SCHEMES = ("http:", "https:", "mailto:", "tel:")

#: A safe CSS colour value: #hex, rgb()/rgba()/hsl()/hsla() with only numeric
#: parts, or a plain colour keyword. Anything else (url(), expression, …) fails.
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_FUNC_COLOR = re.compile(r"^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$", re.I)
_WORD_COLOR = re.compile(r"^[a-zA-Z]+$")


def _safe_color(val: str) -> bool:
    v = (val or "").strip()
    return bool(_HEX_COLOR.match(v) or _FUNC_COLOR.match(v) or _WORD_COLOR.match(v))


def _safe_href(url: str) -> Optional[str]:
    """Keep only safe link targets: absolute http(s)/mailto/tel, or a relative
    URL with no scheme. Drops ``javascript:`` / ``data:`` and anything odd."""
    u = (url or "").strip()
    if not u:
        return None
    low = u.lower()
    if low.startswith(_SAFE_URL_SCHEMES):
        return u
    # A relative URL (no scheme) is fine; a scheme we didn't allow is not.
    if ":" in low.split("/", 1)[0]:
        return None
    return u


def _safe_style(style: str, *, allow_color: bool = True) -> str:
    """Rebuild a ``style`` string from allowlisted properties with safe values
    (no ``url(...)``, no ``expression``, no injection). Colour properties take
    validated colour values (hex / rgb() / hsl() / keyword); ``allow_color=False``
    drops them entirely (ATS standardization). Returns '' if nothing survives."""
    out: list[str] = []
    for decl in (style or "").split(";"):
        if ":" not in decl:
            continue
        prop, _, val = decl.partition(":")
        prop = prop.strip().lower()
        val = val.strip()
        if prop not in _ALLOWED_STYLE_PROPS or not val or len(val) > 120:
            continue
        if prop in _COLOR_PROPS:
            if not allow_color or not _safe_color(val):
                continue
            out.append(f"{prop}: {val}")
            continue
        low = val.lower()
        # Non-colour values must not carry a CSS function, url(), or expression.
        if "(" in low or "@" in low or "expression" in low or "/*" in low:
            continue
        out.append(f"{prop}: {val}")
    return "; ".join(out)


class _Sanitizer(HTMLParser):
    """Re-serialize HTML from an allowlist. Disallowed tags are dropped but their
    text is kept; ``script``/``style`` content is discarded entirely."""

    def __init__(self, *, allow_color: bool = True) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0  # inside a script/style subtree -> drop text
        self._allow_color = allow_color

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip_depth += 1
            return
        if tag not in _ALLOWED_TAGS:
            return
        kept: list[str] = []
        for name, value in attrs:
            if tag == "a" and name == "href":
                safe = _safe_href(value or "")
                if safe:
                    kept.append(f'href="{escape(safe, quote=True)}"')
            elif name == "style":
                safe = _safe_style(value or "", allow_color=self._allow_color)
                if safe:
                    kept.append(f'style="{escape(safe, quote=True)}"')
            # every other attribute (class, id, on*, data-*) is dropped
        attr_str = (" " + " ".join(kept)) if kept else ""
        if tag in _VOID_TAGS:
            self.parts.append(f"<{tag}{attr_str}>")
        else:
            self.parts.append(f"<{tag}{attr_str}>")

    def handle_startendtag(self, tag, attrs):
        if tag in _VOID_TAGS:
            self.handle_starttag(tag, attrs)
        else:
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if tag not in _ALLOWED_TAGS or tag in _VOID_TAGS:
            return
        self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        if self._skip_depth:
            return
        self.parts.append(escape(data))


def sanitize_html(html: str, *, allow_color: bool = True) -> str:
    """Allowlist-sanitize editor HTML for safe storage + re-render. With
    ``allow_color=False`` all colour declarations are dropped (ATS-safe). Returns
    '' for empty input."""
    if not (html or "").strip():
        return ""
    s = _Sanitizer(allow_color=allow_color)
    s.feed(html)
    s.close()
    return "".join(s.parts).strip()


def strip_colors(html: str) -> str:
    """Remove all text/background colour from already-stored rich HTML, keeping
    every other formatting — the 'standardize for ATS' action on an imported,
    coloured document."""
    return sanitize_html(html, allow_color=False)


def has_colors(html: str) -> bool:
    """True if the rich HTML carries any text/background colour — the signal the
    UI uses to offer 'keep colours or standardize for ATS?' on an imported file."""
    return sanitize_html(html) != strip_colors(html)


# --- parse to blocks (for text projection + docx export) ---------------------

@dataclass
class Run:
    text: str = ""
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    font: str = ""       # family name, e.g. "Arial"
    size_pt: float = 0.0  # 0 => default
    color: str = ""       # text colour (#hex / rgb() / keyword); '' => default


@dataclass
class Block:
    kind: str = "p"       # p | h1 | h2 | h3 | li-ul | li-ol | blockquote
    align: str = ""       # '', left, center, right, justify
    runs: list[Run] = field(default_factory=list)

    def text(self) -> str:
        return "".join(r.text for r in self.runs)


_HEADINGS = {"h1": "h1", "h2": "h2", "h3": "h3"}


def _parse_font(style: str) -> tuple[str, float, bool, bool, bool, str]:
    """Pull (font_family, size_pt, bold, italic, underline, color) from a style."""
    fam, size, bold, italic, underline, color = "", 0.0, False, False, False, ""
    for decl in (style or "").split(";"):
        prop, _, raw = decl.partition(":")
        prop = prop.strip().lower()
        raw = raw.strip()  # keep original case (font-family names are case-sensitive)
        low = raw.lower()
        if prop == "font-family" and raw:
            fam = raw.split(",")[0].strip().strip("'\"")
        elif prop == "font-size" and low:
            num = "".join(c for c in low if (c.isdigit() or c == "."))
            try:
                n = float(num)
                size = n * 0.75 if "px" in low else n  # px -> pt
            except ValueError:
                pass
        elif prop == "font-weight" and (low == "bold" or (low.isdigit() and int(low) >= 600)):
            bold = True
        elif prop == "font-style" and low == "italic":
            italic = True
        elif prop == "text-decoration" and "underline" in low:
            underline = True
        elif prop == "color" and raw and _safe_color(raw):
            color = raw
    return fam, size, bold, italic, underline, color


class _BlockParser(HTMLParser):
    """Parse sanitized HTML into blocks with inline-formatted runs."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self._cur: Optional[Block] = None
        self._fmt = {"bold": 0, "italic": 0, "underline": 0, "strike": 0}
        self._font: list[tuple[str, float, str]] = []  # stack of (family, size, color)
        self._list: list[str] = []  # stack of 'ul' | 'ol'

    def _begin(self, kind: str, align: str = "") -> None:
        self._cur = Block(kind=kind, align=align)
        self.blocks.append(self._cur)

    def _align_of(self, attrs) -> str:
        for n, v in attrs:
            if n == "style":
                for decl in (v or "").split(";"):
                    p, _, val = decl.partition(":")
                    if p.strip().lower() == "text-align":
                        return val.strip().lower()
        return ""

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            if self._cur:
                self._cur.runs.append(Run(text="\n"))
            return
        if tag in _HEADINGS:
            self._begin(_HEADINGS[tag], self._align_of(attrs))
        elif tag == "p":
            self._begin("p", self._align_of(attrs))
        elif tag == "blockquote":
            self._begin("blockquote", self._align_of(attrs))
        elif tag in ("ul", "ol"):
            self._list.append(tag)
        elif tag == "li":
            kind = "li-ol" if (self._list and self._list[-1] == "ol") else "li-ul"
            self._begin(kind, self._align_of(attrs))
        elif tag in ("strong", "b"):
            self._fmt["bold"] += 1
        elif tag in ("em", "i"):
            self._fmt["italic"] += 1
        elif tag == "u":
            self._fmt["underline"] += 1
        elif tag in ("s", "strike", "del"):
            self._fmt["strike"] += 1
        elif tag == "span":
            style = next((v for n, v in attrs if n == "style"), "") or ""
            fam, size, b, i, u, color = _parse_font(style)
            prev = self._font[-1] if self._font else ("", 0.0, "")
            self._font.append((fam or prev[0], size or prev[1], color or prev[2]))
            if b:
                self._fmt["bold"] += 1
            if i:
                self._fmt["italic"] += 1
            if u:
                self._fmt["underline"] += 1
            # stash whether this span added emphasis, to undo on close
            self._span_added = getattr(self, "_span_added", [])
            self._span_added.append((b, i, u))

    def handle_endtag(self, tag):
        if tag in ("strong", "b"):
            self._fmt["bold"] = max(0, self._fmt["bold"] - 1)
        elif tag in ("em", "i"):
            self._fmt["italic"] = max(0, self._fmt["italic"] - 1)
        elif tag == "u":
            self._fmt["underline"] = max(0, self._fmt["underline"] - 1)
        elif tag in ("s", "strike", "del"):
            self._fmt["strike"] = max(0, self._fmt["strike"] - 1)
        elif tag == "span":
            if self._font:
                self._font.pop()
            added = getattr(self, "_span_added", [])
            if added:
                b, i, u = added.pop()
                if b:
                    self._fmt["bold"] = max(0, self._fmt["bold"] - 1)
                if i:
                    self._fmt["italic"] = max(0, self._fmt["italic"] - 1)
                if u:
                    self._fmt["underline"] = max(0, self._fmt["underline"] - 1)
        elif tag in ("ul", "ol"):
            if self._list:
                self._list.pop()
        elif tag in ("p", "h1", "h2", "h3", "li", "blockquote"):
            self._cur = None

    def handle_data(self, data):
        if not data:
            return
        if self._cur is None:
            # loose text outside any block -> its own paragraph
            self._begin("p")
        fam, size, color = (self._font[-1] if self._font else ("", 0.0, ""))
        self._cur.runs.append(Run(
            text=data,
            bold=self._fmt["bold"] > 0,
            italic=self._fmt["italic"] > 0,
            underline=self._fmt["underline"] > 0,
            strike=self._fmt["strike"] > 0,
            font=fam, size_pt=size, color=color,
        ))


def html_to_blocks(html: str) -> list[Block]:
    """Parse HTML into formatted blocks. Empty blocks are dropped."""
    p = _BlockParser()
    p.feed(html or "")
    p.close()
    return [b for b in p.blocks if b.text().strip()]


_MD_PREFIX = {"h1": "# ", "h2": "## ", "h3": "### ", "li-ul": "- ", "li-ol": "- ",
              "blockquote": "> "}


def html_to_text(html: str) -> str:
    """Derive the plain-text / light-markdown projection the AI + ATS read. Bold
    -> ``**..**``, italic -> ``*..*``, headings -> ``#``, list items -> ``-``."""
    lines: list[str] = []
    for b in html_to_blocks(html):
        parts: list[str] = []
        for r in b.runs:
            t = unescape(r.text)
            if not t:
                continue
            if r.bold and t.strip():
                t = f"**{t}**"
            if r.italic and t.strip():
                t = f"*{t}*"
            parts.append(t)
        line = (_MD_PREFIX.get(b.kind, "") + "".join(parts)).rstrip()
        lines.append(line)
    # Blank line between blocks for readable paragraphs; collapse runs of blanks.
    text = "\n\n".join(l for l in lines if l.strip())
    return text.strip()


# --- docx -> html (seed the rich Working copy from a .docx upload) -----------

def _run_html(run) -> str:
    """One python-docx run -> inline HTML, preserving bold/italic/underline/strike
    and font family/size (the subset the editor + exporter understand)."""
    text = escape(run.text or "")
    if not text:
        return ""
    styles: list[str] = []
    font = getattr(run, "font", None)
    if font is not None:
        if font.name:
            styles.append(f"font-family: {font.name}")
        if font.size is not None:
            try:
                styles.append(f"font-size: {font.size.pt:g}pt")
            except Exception:  # noqa: BLE001
                pass
        try:
            rgb = font.color.rgb if font.color is not None else None
            if rgb is not None:
                styles.append(f"color: #{str(rgb)}")
        except Exception:  # noqa: BLE001 - theme colours have no rgb
            pass
    inner = text
    if styles:
        inner = f'<span style="{escape("; ".join(styles), quote=True)}">{inner}</span>'
    if run.underline:
        inner = f"<u>{inner}</u>"
    if run.italic:
        inner = f"<em>{inner}</em>"
    if run.bold:
        inner = f"<strong>{inner}</strong>"
    if font is not None and getattr(font, "strike", False):
        inner = f"<s>{inner}</s>"
    return inner


def docx_to_html(data: bytes) -> str:
    """Convert an uploaded ``.docx`` to the sanitized HTML subset, so the Working
    copy opens already formatted (Option B upload seeding). Returns '' when
    python-docx is unavailable or the bytes aren't a readable .docx."""
    try:
        import io

        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except Exception:  # noqa: BLE001 - python-docx not installed
        return ""
    try:
        doc = Document(io.BytesIO(data))
    except Exception:  # noqa: BLE001 - not a valid .docx
        return ""

    align_map = {
        WD_ALIGN_PARAGRAPH.CENTER: "center", WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify", WD_ALIGN_PARAGRAPH.LEFT: "left",
    }
    parts: list[str] = []
    list_open: Optional[str] = None

    def close_list() -> None:
        nonlocal list_open
        if list_open:
            parts.append(f"</{list_open}>")
            list_open = None

    for p in doc.paragraphs:
        if not (p.text or "").strip():
            continue
        style = (p.style.name or "").lower() if p.style is not None else ""
        inner = "".join(_run_html(r) for r in p.runs) or escape(p.text)
        if style.startswith("heading 1") or style == "title":
            close_list(); parts.append(f"<h1>{inner}</h1>")
        elif style.startswith("heading 2"):
            close_list(); parts.append(f"<h2>{inner}</h2>")
        elif style.startswith("heading"):
            close_list(); parts.append(f"<h3>{inner}</h3>")
        elif "number" in style:
            if list_open != "ol":
                close_list(); parts.append("<ol>"); list_open = "ol"
            parts.append(f"<li>{inner}</li>")
        elif "list" in style or "bullet" in style:
            if list_open != "ul":
                close_list(); parts.append("<ul>"); list_open = "ul"
            parts.append(f"<li>{inner}</li>")
        else:
            close_list()
            align = align_map.get(p.alignment)
            attr = f' style="text-align: {align}"' if align else ""
            parts.append(f"<p{attr}>{inner}</p>")
    close_list()
    return sanitize_html("".join(parts))
