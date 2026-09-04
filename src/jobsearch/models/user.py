"""User, profile, and job-search preferences."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

JobType = Literal["full_time", "part_time", "contract", "internship", "temporary"]


class SalaryRange(DomainModel):
    currency: str = "USD"
    minimum: Optional[int] = None
    maximum: Optional[int] = None


class WorkExperience(DomainModel):
    company: str
    title: str
    start: Optional[str] = None  # ISO date or free "2021" — kept flexible for import
    end: Optional[str] = None
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class Education(DomainModel):
    institution: str
    degree: str = ""
    field_of_study: str = ""
    graduation_year: Optional[int] = None


class JobPreferences(DomainModel):
    """Section 4: UserProfile.preferences."""

    job_type: Optional[JobType] = None
    salary_range: SalaryRange = Field(default_factory=SalaryRange)
    remote_ok: bool = True
    target_roles: list[str] = Field(default_factory=list)
    target_locations: list[str] = Field(default_factory=list)
    seniority: Optional[str] = None  # e.g. "junior", "mid", "senior", "staff"
    #: Broad job categories to focus matches on (empty = all categories).
    job_categories: list[str] = Field(default_factory=list)


class UserProfile(DomainModel):
    """1:1 with User — the structured context feeding matching & generation."""

    user_id: str
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    work_experience: list[WorkExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    preferences: JobPreferences = Field(default_factory=JobPreferences)

    def to_context_text(self) -> str:
        """Flatten the profile into text for embedding / LLM prompts."""
        parts: list[str] = []
        if self.headline:
            parts.append(f"Headline: {self.headline}")
        if self.summary:
            parts.append(f"Summary: {self.summary}")
        if self.skills:
            parts.append("Skills: " + ", ".join(self.skills))
        for exp in self.work_experience:
            hl = ("; ".join(exp.highlights)) if exp.highlights else exp.summary
            parts.append(f"Experience: {exp.title} at {exp.company}. {hl}".strip())
        for edu in self.education:
            parts.append(f"Education: {edu.degree} {edu.field_of_study} — {edu.institution}".strip())
        if self.preferences.target_roles:
            parts.append("Target roles: " + ", ".join(self.preferences.target_roles))
        return "\n".join(p for p in parts if p)


class User(DomainModel):
    id: str = Field(default_factory=lambda: new_id("usr_"))
    email: str
    hashed_password: str = ""  # auth service owns hashing; engines never see plaintext
    #: Firebase Auth UID when the user signs in via Firebase (password stays with
    #: the provider — this app never sees it).
    firebase_uid: str = ""
    full_name: str = ""
    phone: str = ""  # used to fill application forms; never fabricated
    location: str = ""
    #: Unique token in the user's personal forwarding address
    #: (jobs+<token>@<inbox_domain>). Generated lazily on first use.
    inbox_token: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
