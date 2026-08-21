"""Community job-authenticity records — is this posting real, dubious, or a scam?

One record per *job identity* (normalized company + title), shared across all
users. It fuses crowd reports with automated signals (the fraud score + an
employer-site check) into a single consensus ``verdict``. ``votes`` maps a
reporter to their verdict and is internal — the API exposes only tallies plus
the caller's own vote.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class Verdict(str, Enum):
    VERIFIED_REAL = "verified_real"  # listed on the employer site + community trust
    LIKELY_REAL = "likely_real"
    UNVERIFIED = "unverified"
    DUBIOUS = "dubious"
    LIKELY_SCAM = "likely_scam"


class ReportVerdict(str, Enum):
    LEGIT = "legit"
    DUBIOUS = "dubious"
    SCAM = "scam"


class EmployerStatus(str, Enum):
    LISTED = "listed"  # posting/company still present on the employer site
    NOT_FOUND = "not_found"  # posting gone / never on the employer site
    INVALID_DOMAIN = "invalid_domain"  # company domain doesn't resolve
    UNKNOWN = "unknown"  # not checked / couldn't determine


class JobAuthenticityRecord(DomainModel):
    id: str = Field(default_factory=lambda: new_id("auth_"))
    key: str  # normalized "company|title"
    company: str = ""
    title: str = ""
    #: reporter_id -> ReportVerdict value (internal; never returned to clients).
    votes: dict[str, str] = Field(default_factory=dict)
    reasons: list[str] = Field(default_factory=list)  # short, capped
    employer_status: EmployerStatus = EmployerStatus.UNKNOWN
    employer_detail: str = ""
    #: Lowest automated authenticity score (0-100) seen for this identity.
    min_authenticity_score: int = 100
    verdict: Verdict = Verdict.UNVERIFIED  # cached; recomputed on each update
    last_checked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def tally(self) -> dict[str, int]:
        counts = {"legit": 0, "dubious": 0, "scam": 0}
        for v in self.votes.values():
            if v in counts:
                counts[v] += 1
        return counts
