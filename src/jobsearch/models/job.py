"""Job postings and their authenticity verification results."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import Field, computed_field

from jobsearch.models.common import DomainModel, new_id, utcnow
from jobsearch.models.user import SalaryRange


class JobPosting(DomainModel):
    id: str = Field(default_factory=lambda: new_id("job_"))
    source_platform: str = ""  # e.g. "linkedin", "indeed", "greenhouse"
    external_id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    remote: bool = False
    description: str = ""
    requirements: list[str] = Field(default_factory=list)
    salary_range: Optional[SalaryRange] = None
    posted_at: Optional[datetime] = None
    fetched_at: datetime = Field(default_factory=utcnow)
    url: str = ""
    company_domain: str = ""  # used by authenticity verification
    application_email: str = ""  # where email submissions are sent, when known

    # Structured metadata parsed from the title/description at ingestion.
    seniority: str = ""  # junior | mid | senior | lead | staff | principal | director
    employment_type: str = ""  # full-time | part-time | contract | temporary | internship
    years_experience: Optional[int] = None  # required years of experience
    benefits: list[str] = Field(default_factory=list)  # e.g. 401(k), medical, remote

    # Repeat-sighting tracking — how often this posting has resurfaced over time.
    times_seen: int = 1
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)

    # Populated by the engines (not the ingestion source):
    is_verified: Optional[bool] = None
    match_score: Optional[float] = None  # 0-100, per current user

    @computed_field  # serialized: how old the posting is, in days (None if unknown)
    @property
    def age_days(self) -> Optional[int]:
        if self.posted_at is None:
            return None
        posted = self.posted_at
        now = utcnow()
        if posted.tzinfo is None:  # compare naive-vs-naive
            now = now.replace(tzinfo=None)
        elif now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return max(0, (now - posted).days)

    @computed_field  # serialized: human-readable "posted X ago" (empty if unknown)
    @property
    def posted_ago(self) -> str:
        d = self.age_days
        if d is None:
            return ""
        if d == 0:
            return "today"
        if d == 1:
            return "yesterday"
        if d < 7:
            return f"{d} days ago"
        if d < 14:
            return "1 week ago"
        if d < 31:
            return f"{d // 7} weeks ago"
        if d < 60:
            return "1 month ago"
        return f"{d // 30} months ago"

    def to_matching_text(self) -> str:
        """Flatten the posting into text for embedding / matching."""
        parts = [self.title, self.company, self.location, self.description]
        if self.requirements:
            parts.append("Requirements: " + "; ".join(self.requirements))
        return "\n".join(p for p in parts if p)


class VerificationFlag(str, Enum):
    """Discrete fraud/quality signals raised during verification."""

    YOUNG_DOMAIN = "young_domain"
    UNVERIFIED_COMPANY = "unverified_company"
    HIGH_POSTING_VELOCITY = "high_posting_velocity"
    IMPLAUSIBLE_SALARY = "implausible_salary"
    URGENCY_LANGUAGE = "urgency_language"
    VAGUE_REQUIREMENTS = "vague_requirements"
    EXCESSIVE_PROMISES = "excessive_promises"
    KNOWN_SCAM_SOURCE = "known_scam_source"
    CONTACT_OFF_PLATFORM = "contact_off_platform"


class VerificationResult(DomainModel):
    """1:1 with a JobPosting — output of the authenticity engine."""

    id: str = Field(default_factory=lambda: new_id("verif_"))
    job_posting_id: str
    authenticity_score: int = 100  # 0 (fraud) .. 100 (trusted)
    flags: list[VerificationFlag] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=utcnow)
    details: dict[str, Any] = Field(default_factory=dict)

    @property
    def display_action(self) -> str:
        """Section 6.4 display policy derived from the score."""
        if self.authenticity_score <= 39:
            return "hidden"  # opt-in only
        if self.authenticity_score <= 69:
            return "warn"  # shown with warning banner
        return "show"  # shown normally
