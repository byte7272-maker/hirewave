"""Résumé templates — a SHARED library of style configs available to all users.

A template captures a résumé's basic structure, fonts, and style as a config (not
raw HTML), tracked by ``category`` (type). The 8 built-in defaults ship for everyone;
templates users save join the shared library too. A single renderer applies any
template to a user's JSON Resume data to produce the finished résumé.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

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
    shared: bool = True  # in the shared library available to all users
    uses: int = 0  # how many times it's been applied (popularity)
    style: ResumeTemplateStyle = Field(default_factory=ResumeTemplateStyle)
    created_at: datetime = Field(default_factory=utcnow)


def _preset(id_, name, category, description, **style) -> ResumeTemplate:
    return ResumeTemplate(id=id_, name=name, category=category, description=description,
                          source="preset", created_by="", shared=True,
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
