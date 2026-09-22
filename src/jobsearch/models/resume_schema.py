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
