"""Job postings and their authenticity verification results."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import Field, computed_field

from jobsearch.models.common import DomainModel, new_id, utcnow
from jobsearch.models.user import SalaryRange


_SOURCE_NAMES = {
    "linkedin": "LinkedIn", "indeed": "Indeed", "glassdoor": "Glassdoor",
    "monster": "Monster", "ziprecruiter": "ZipRecruiter", "dice": "Dice",
    "greenhouse": "Greenhouse", "lever": "Lever", "wellfound": "Wellfound",
    "aggregator": "Aggregator",
}


def _money(amount: Optional[int], currency: str) -> str:
    """Format a salary amount compactly, ASCII-only (e.g. ``$120k``, ``90k EUR``)."""
    if not amount:
        return ""
    if amount >= 1000 and amount % 1000 == 0:
        val = f"{amount // 1000}k"
    elif amount >= 10000:
        val = f"{amount / 1000:.0f}k"
    else:
        val = f"{amount:,}"
    return f"${val}" if currency == "USD" else f"{val} {currency}"


def format_salary(salary: "Optional[SalaryRange]") -> str:
    """A human-readable salary string, ASCII-only (``$90k - $130k``, ``From $90k``);
    empty when no salary is known."""
    if salary is None:
        return ""
    cur = salary.currency or "USD"
    lo, hi = _money(salary.minimum, cur), _money(salary.maximum, cur)
    if lo and hi:
        return lo if lo == hi else f"{lo} - {hi}"
    if lo:
        return f"From {lo}"
    if hi:
        return f"Up to {hi}"
    return ""


def source_display_name(source_platform: str) -> str:
    """A nicely-cased board name for display (``linkedin`` -> ``LinkedIn``)."""
    s = (source_platform or "").strip()
    return _SOURCE_NAMES.get(s.lower(), s.title()) if s else ""


def company_logo_from(domain: str) -> str:
    """Best-effort company logo URL derived from a company web/email domain.

    Uses Clearbit's public logo endpoint (no API key, real company marks). Returns
    "" when there is no domain, so callers can fall back to a lettermark. The image
    may 404 for unknown/placeholder domains — the frontend should handle a broken
    image by showing initials.
    """
    d = (domain or "").strip().lower()
    return f"https://logo.clearbit.com/{d}" if d else ""


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
    company_logo_url: str = ""  # explicit logo from the source (e.g. LinkedIn), when provided
    application_email: str = ""  # where email submissions are sent, when known

    # Structured metadata parsed from the title/description at ingestion.
    category: str = ""  # broad job category (Engineering, Data & Analytics, …)
    category_version: int = 0  # classifier version that set `category` (for re-backfill)
    seniority: str = ""  # junior | mid | senior | lead | staff | principal | director
    employment_type: str = ""  # full-time | part-time | contract | temporary | internship
    years_experience: Optional[int] = None  # required years of experience
    benefits: list[str] = Field(default_factory=list)  # e.g. 401(k), medical, remote

    # Repeat-sighting tracking — how often this posting has resurfaced over time.
    times_seen: int = 1
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)

    # Cross-posting: the same opening often appears on several boards. Postings that
    # look like the same job (same company + position) are KEPT (not collapsed) and
    # linked via a shared group id, so the user sees each source. Only obvious
    # identical re-posts (same company + position + description language) are
    # consolidated into one, tracked by the counters below.
    duplicate_group_id: str = ""  # shared by postings likely to be the same job
    cross_posting_ids: list[str] = Field(default_factory=list)  # other kept postings, likely the same job
    consolidated_count: int = 0  # identical re-posts merged into this one
    consolidated_sources: list[str] = Field(default_factory=list)  # boards those merged posts came from

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

    @computed_field  # resolved logo for display: explicit source logo, else domain-derived
    @property
    def company_logo(self) -> str:
        return self.company_logo_url or company_logo_from(self.company_domain)

    @computed_field  # True when another kept posting looks like the same job (cross-board)
    @property
    def likely_duplicate(self) -> bool:
        return bool(self.cross_posting_ids)

    @computed_field  # human-readable salary (e.g. "$90k - $130k"); empty when unknown
    @property
    def salary_display(self) -> str:
        return format_salary(self.salary_range)

    @computed_field  # nicely-cased source board name (e.g. "LinkedIn")
    @property
    def source_display(self) -> str:
        return source_display_name(self.source_platform)

    def to_matching_text(self) -> str:
        """Flatten the posting into text for embedding / matching."""
        parts = [self.title, self.company, self.location, self.description]
        if self.requirements:
            parts.append("Requirements: " + "; ".join(self.requirements))
        return "\n".join(p for p in parts if p)


class SavedJob(DomainModel):
    """A job the user bookmarked. Keyed ``{user_id}:{job_posting_id}`` so saving is
    idempotent (no duplicates)."""

    id: str = ""  # composite "{user_id}:{job_posting_id}"
    user_id: str
    job_posting_id: str
    note: str = ""
    display_order: int = 0  # user's manual ordering (lower = higher in the list)
    saved_at: datetime = Field(default_factory=utcnow)


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
