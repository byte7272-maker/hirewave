"""In-app inbox — job-alert emails the user forwards to their account."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class InboxMessage(DomainModel):
    id: str = Field(default_factory=lambda: new_id("inmsg_"))
    user_id: str
    source: str = ""  # detected board (linkedin/indeed/…)
    sender: str = ""  # From header
    subject: str = ""
    snippet: str = ""  # short preview
    job_ids: list[str] = Field(default_factory=list)  # postings ingested from this email
    ingested: int = 0
    is_read: bool = False
    received_at: datetime = Field(default_factory=utcnow)
