"""A saved job search the agent re-runs on a schedule."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class SavedSearch(DomainModel):
    """A stored search (role/location/remote/sources) the agent runs periodically,
    ingesting new postings and notifying the user of fresh high-fit roles."""

    id: str = Field(default_factory=lambda: new_id("ss_"))
    user_id: str
    role: str
    location: str = ""
    remote: Optional[bool] = None
    sources: list[str] = Field(default_factory=list)  # empty = all enabled sources
    interval_minutes: int = 1440  # how often the agent re-runs it (default daily)
    active: bool = True
    last_run_at: Optional[datetime] = None
    last_new_count: int = 0  # new visible roles found on the last run
    created_at: datetime = Field(default_factory=utcnow)
