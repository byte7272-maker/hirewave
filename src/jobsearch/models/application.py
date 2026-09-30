"""Application tracking entity."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class ApplicationStatus(str, Enum):
    DRAFT = "draft"
    #: Auto-apply prepared this application but it is NOT sent — it waits for the
    #: user's explicit per-application approval. A real submission never happens
    #: from an autonomous run; only an approval turns this into ``submitted``.
    PENDING_APPROVAL = "pending_approval"
    SUBMITTED = "submitted"
    INTERVIEWING = "interviewing"
    REJECTED = "rejected"
    OFFERED = "offered"


class Application(DomainModel):
    """Central tracking entity linking user, job, resume and cover letter."""

    id: str = Field(default_factory=lambda: new_id("app_"))
    user_id: str
    job_posting_id: str
    resume_id: Optional[str] = None
    cover_letter_id: Optional[str] = None
    status: ApplicationStatus = ApplicationStatus.DRAFT
    submitted_at: Optional[datetime] = None
    platform_response: dict[str, Any] = Field(default_factory=dict)
    audit_trail: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def record_event(self, action: str, **detail: Any) -> None:
        """Append an entry to the automation audit trail (section 6.5)."""
        self.audit_trail = [
            *self.audit_trail,
            {"action": action, "at": utcnow().isoformat(), **detail},
        ]
