"""JSON Resume schema (https://jsonresume.org) — the structured content model.

This is the canonical shape the app parses a résumé into, so the frontend can render
it into any open-source template/theme, and so AI improvements can target specific
fields. Field names follow the JSON Resume standard (camelCase) for theme
compatibility.
"""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel


class ResumeLocation(DomainModel):
    address: str = ""
    city: str = ""
    region: str = ""
    postalCode: str = ""
    countryCode: str = ""


class ResumeProfile(DomainModel):
    network: str = ""  # e.g. "LinkedIn", "GitHub"
    username: str = ""
    url: str = ""


class ResumeBasics(DomainModel):
    name: str = ""
    label: str = ""  # headline, e.g. "IT Director"
    email: str = ""
    phone: str = ""
    url: str = ""
    summary: str = ""
    location: ResumeLocation = Field(default_factory=ResumeLocation)
    profiles: list[ResumeProfile] = Field(default_factory=list)


class ResumeWork(DomainModel):
    name: str = ""  # company/organization
    position: str = ""
    url: str = ""
    startDate: str = ""
    endDate: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class ResumeEducation(DomainModel):
    institution: str = ""
    area: str = ""  # field of study
    studyType: str = ""  # degree
    startDate: str = ""
    endDate: str = ""
    score: str = ""
    courses: list[str] = Field(default_factory=list)


class ResumeSkill(DomainModel):
    name: str = ""
    level: str = ""
    keywords: list[str] = Field(default_factory=list)


class ResumeProject(DomainModel):
    name: str = ""
    description: str = ""
    highlights: list[str] = Field(default_factory=list)
    url: str = ""


class ResumeCertificate(DomainModel):
    name: str = ""
    issuer: str = ""
    date: str = ""


class ResumeData(DomainModel):
    """A résumé as JSON Resume — the interchange model for templates + AI edits."""

    basics: ResumeBasics = Field(default_factory=ResumeBasics)
    work: list[ResumeWork] = Field(default_factory=list)
    education: list[ResumeEducation] = Field(default_factory=list)
    skills: list[ResumeSkill] = Field(default_factory=list)
    projects: list[ResumeProject] = Field(default_factory=list)
    certificates: list[ResumeCertificate] = Field(default_factory=list)
    awards: list[dict] = Field(default_factory=list)
    languages: list[dict] = Field(default_factory=list)


def _dates(start: str, end: str) -> str:
    if start and end:
        return f" ({start} - {end})"
    return f" ({start or end})" if (start or end) else ""


def resume_data_to_markdown(data: ResumeData) -> str:
    """Serialize a JSON Resume object back to the canonical Markdown the app stores
    (so a structured AI improvement can be saved as a normal résumé version)."""
    lines: list[str] = []
    b = data.basics
    if b.name:
        lines.append(f"**{b.name}**")
    loc = b.location.city + (f", {b.location.region}" if b.location.region else "") if b.location.city else ""
    contact = " | ".join(x for x in [b.label, b.email, b.phone, loc] if x)
    if contact:
        lines.append(contact)
    if b.summary:
        lines += ["", "## Summary", b.summary]

    if data.work:
        lines += ["", "## Experience"]
        for w in data.work:
            head = " ".join(p for p in [f"**{w.position}**" if w.position else "",
                                        f"at {w.name}" if w.name else ""] if p) + _dates(w.startDate, w.endDate)
            if head.strip():
                lines.append(head.strip())
            if w.summary:
                lines.append(w.summary)
            lines += [f"- {h}" for h in w.highlights if h]

    if data.education:
        lines += ["", "## Education"]
        for e in data.education:
            deg = " ".join(p for p in [f"**{e.studyType}**" if e.studyType else "", e.area,
                                       f"- {e.institution}" if e.institution else ""] if p)
            lines.append((deg + _dates(e.startDate, e.endDate)).strip())

    if data.projects:
        lines += ["", "## Projects"]
        for p in data.projects:
            if p.name:
                lines.append(f"**{p.name}**" + (f" - {p.description}" if p.description else ""))
            lines += [f"- {h}" for h in p.highlights if h]

    if data.skills:
        lines += ["", "## Skills"]
        parts = [s.name for s in data.skills if s.name]
        parts += [k for s in data.skills for k in s.keywords]
        if parts:
            lines.append(", ".join(dict.fromkeys(parts)))

    return "\n".join(lines).strip()
