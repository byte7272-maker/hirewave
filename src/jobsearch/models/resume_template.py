"""Résumé templates — a SHARED library of style configs available to all users.

A template captures a résumé's basic structure, fonts, and style as a config (not
raw HTML), tracked by ``category`` (type). The 8 built-in defaults ship for everyone;
templates users save join the shared library after passing the quality gate.

PRIVACY: a template stores STYLE ONLY (colors, fonts, layout) plus a name/category.
It never contains a user's résumé content (name, work history, skills, etc.). A
user's actual résumé is never shared to the community by saving a template.
"""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

# Allowed values for each style token (the quality gate rejects anything else).
_ALLOWED = {
    "font_family": {"sans", "serif", "mono"},
    "layout": {"single", "two-column"},
    "heading_style": {"underline", "bar", "plain", "caps"},
    "density": {"compact", "normal", "spacious"},
    "name_size": {"small", "medium", "large"},
    "align_header": {"left", "center"},
}
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_BANNED = {"fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot", "porn", "sex"}

_SECTIONS = ["summary", "work", "skills", "education", "projects", "certificates"]

#: Template categories (the "type" the library is tracked by).
TEMPLATE_CATEGORIES = [
    "modern", "classic", "minimal", "executive",
    "creative", "technical", "academic", "elegant",
]


class ResumeTemplateStyle(DomainModel):
    """Design tokens a résumé renderer applies to JSON Resume data."""

    accent_color: str = "#2563eb"  # hex
    font_family: str = "sans"  # sans | serif | mono
    layout: str = "single"  # single | two-column
    heading_style: str = "underline"  # underline | bar | plain | caps
    density: str = "normal"  # compact | normal | spacious
    name_size: str = "large"  # small | medium | large
    uppercase_headings: bool = True
    show_divider: bool = True
    align_header: str = "left"  # left | center
    section_order: list[str] = Field(default_factory=lambda: list(_SECTIONS))


class ResumeTemplate(DomainModel):
    id: str = Field(default_factory=lambda: new_id("tpl_"))
    name: str = ""
    category: str = "custom"  # the type; one of TEMPLATE_CATEGORIES (or "custom")
    description: str = ""
    source: str = "custom"  # preset | generated | custom
    created_by: str = ""  # user id of the contributor ("" = built-in)
    shared: bool = True  # intended for the shared library
    status: str = "pending"  # pending | approved | rejected (quality gate)
    flags: int = 0  # community reports; auto-hides for review past a threshold
    uses: int = 0  # how many times it's been applied (popularity)
    style: ResumeTemplateStyle = Field(default_factory=ResumeTemplateStyle)
    created_at: datetime = Field(default_factory=utcnow)


def _preset(id_, name, category, description, **style) -> ResumeTemplate:
    return ResumeTemplate(id=id_, name=name, category=category, description=description,
                          source="preset", created_by="", shared=True, status="approved",
                          style=ResumeTemplateStyle(**style))


#: The 8 default styles every user can pick from.
BUILTIN_TEMPLATES: list[ResumeTemplate] = [
    _preset("tpl_modern", "Modern", "modern",
            "Single column, blue accent, uppercase section headers with a rule.",
            accent_color="#2563eb", font_family="sans", heading_style="underline"),
    _preset("tpl_classic", "Classic", "classic",
            "Traditional serif, centered header, clean rule dividers.",
            accent_color="#111111", font_family="serif", heading_style="plain",
            uppercase_headings=False, name_size="medium", align_header="center"),
    _preset("tpl_minimal", "Minimal", "minimal",
            "Lots of whitespace, sans-serif, thin gray labels, no dividers.",
            accent_color="#374151", font_family="sans", heading_style="plain",
            density="spacious", show_divider=False),
    _preset("tpl_executive", "Executive", "executive",
            "Two-column, navy accent, bold bar section headers for senior roles.",
            accent_color="#1e3a8a", font_family="serif", heading_style="bar",
            layout="two-column"),
    _preset("tpl_creative", "Creative", "creative",
            "Two-column, purple accent, bold headers for design/marketing.",
            accent_color="#7c3aed", font_family="sans", heading_style="bar",
            layout="two-column"),
    _preset("tpl_technical", "Technical", "technical",
            "Compact two-column, teal accent, monospace, caps headers for engineers.",
            accent_color="#0d9488", font_family="mono", heading_style="caps",
            layout="two-column", density="compact"),
    _preset("tpl_academic", "Academic", "academic",
            "Serif, single column, plain headers, generous spacing for CVs.",
            accent_color="#374151", font_family="serif", heading_style="plain",
            uppercase_headings=False, density="spacious"),
    _preset("tpl_elegant", "Elegant", "elegant",
            "Serif, indigo accent, centered name, refined and spacious.",
            accent_color="#5D3FD3", font_family="serif", heading_style="underline",
            density="spacious", align_header="center"),
]


def validate_template(name: str, description: str, style: "ResumeTemplateStyle") -> list[str]:
    """Automated quality gate for a community template. Returns a list of problems
    (empty = passes). Checks the style config is valid + ATS-safe and the text is
    clean. It never inspects résumé content (a template has none)."""
    problems: list[str] = []
    name = (name or "").strip()
    if not (2 <= len(name) <= 60):
        problems.append("name must be 2-60 characters")
    if len(description or "") > 300:
        problems.append("description is too long (max 300 chars)")
    text = f"{name} {description}".lower()
    if any(w in re.findall(r"[a-z]+", text) for w in _BANNED):
        problems.append("name/description contains disallowed language")
    if not _HEX_RE.match(style.accent_color or ""):
        problems.append("accent_color must be a #rrggbb hex value")
    for field, allowed in _ALLOWED.items():
        if getattr(style, field, None) not in allowed:
            problems.append(f"{field} must be one of {sorted(allowed)}")
    order = style.section_order or []
    if order and not set(order) <= set(_SECTIONS):
        problems.append("section_order has unknown sections")
    return problems
