"""User résumé templates — a saved *style config* the frontend renders JSON Resume
data into. AI can generate one from a description; users save and reuse them.

Config (not raw HTML) so a single renderer applies any template safely, it stays
ATS-friendly, and the backend can render the same config to PDF/HTML later.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

_SECTIONS = ["summary", "work", "skills", "education", "projects", "certificates"]


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
    section_order: list[str] = Field(default_factory=lambda: list(_SECTIONS))


class ResumeTemplate(DomainModel):
    id: str = Field(default_factory=lambda: new_id("tpl_"))
    user_id: str = ""  # empty = built-in preset (shared)
    name: str = ""
    description: str = ""
    source: str = "custom"  # preset | generated | custom
    style: ResumeTemplateStyle = Field(default_factory=ResumeTemplateStyle)
    created_at: datetime = Field(default_factory=utcnow)


#: Built-in starting points, returned to every user alongside their own templates.
BUILTIN_TEMPLATES: list[ResumeTemplate] = [
    ResumeTemplate(
        id="tpl_modern", name="Modern", source="preset",
        description="Single column, blue accent, uppercase section headers with a rule.",
        style=ResumeTemplateStyle(accent_color="#2563eb", font_family="sans",
                                  heading_style="underline", uppercase_headings=True),
    ),
    ResumeTemplate(
        id="tpl_classic", name="Classic", source="preset",
        description="Traditional serif, centered header, horizontal-rule dividers.",
        style=ResumeTemplateStyle(accent_color="#111111", font_family="serif",
                                  heading_style="plain", uppercase_headings=False,
                                  name_size="medium"),
    ),
    ResumeTemplate(
        id="tpl_minimal", name="Minimal", source="preset",
        description="Lots of whitespace, sans-serif, thin gray labels, no dividers.",
        style=ResumeTemplateStyle(accent_color="#374151", font_family="sans",
                                  heading_style="plain", density="spacious",
                                  show_divider=False),
    ),
]
