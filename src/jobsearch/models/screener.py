"""Screener-answer memory — learned answers to application screener questions.

Job applications (LinkedIn Easy Apply, Greenhouse, Workday, …) repeatedly ask the
same screener questions: "Do you have a valid driver's license?", "How many years
of X experience?", "Are you authorized to work in the US?". This stores the
user's answers keyed by a *normalized* question so the auto-apply flow can
pre-fill them next time — matching slight wording variations to the same saved
answer — and learns new questions as they arise.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class ScreenerAnswer(DomainModel):
    id: str = Field(default_factory=lambda: new_id("scr_"))
    user_id: str
    question: str  # as last seen, human-readable
    question_key: str = ""  # normalized form used for matching
    answer: str = ""  # the saved answer ("yes", "15", "Authorized", …)
    kind: str = "text"  # "text" | "numeric" | "boolean" | "choice"
    times_used: int = 0  # how often it's been auto-filled
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
