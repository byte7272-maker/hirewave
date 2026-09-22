"""Structured cover-letter model — the shape the cover-letter templates render, and
the target for structure-aware AI improvements (parallels the JSON Resume model)."""

from __future__ import annotations

from pydantic import Field

from jobsearch.models.common import DomainModel


class CoverLetterData(DomainModel):
    name: str = ""  # candidate name (header)
    contact: list[str] = Field(default_factory=list)  # email, phone, location, etc.
    date: str = ""
    company: str = ""
    role: str = ""
    salutation: str = ""  # e.g. "Dear Hiring Manager,"
    paragraphs: list[str] = Field(default_factory=list)  # body paragraphs
    closing: str = ""  # e.g. "Sincerely,"
    signature: str = ""  # signed name


def cover_letter_data_to_markdown(data: CoverLetterData) -> str:
    """Serialize a structured cover letter back to the plain text the app stores (so a
    structured improvement can be saved as a normal cover-letter version)."""
    lines: list[str] = []
    if data.name:
        lines.append(data.name)
    if data.contact:
        lines.append(" | ".join(c for c in data.contact if c))
    if data.date:
        lines += ["", data.date]
    if data.company or data.role:
        lines.append("")
        if data.company:
            lines.append(data.company)
        if data.role:
            lines.append(f"Re: {data.role}")
    if data.salutation:
        lines += ["", data.salutation]
    for para in data.paragraphs:
        if para:
            lines += ["", para]
    if data.closing:
        lines += ["", data.closing]
    if data.signature:
        lines.append(data.signature)
    return "\n".join(lines).strip()
