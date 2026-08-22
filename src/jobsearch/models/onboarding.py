"""Beginner onboarding progress — drives the 'Getting Started' wizard hub.

Most step status is *derived* at read time from what the user already has (a
résumé, a search, an application, a mock interview…), so the checklist stays
accurate without the client reporting anything. This model only stores the
explicit overrides: steps the user marked done/skipped, and whether they
dismissed the whole hub.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, utcnow


class OnboardingProgress(DomainModel):
    user_id: str
    #: True once the user dismisses the Getting Started hub entirely.
    dismissed: bool = False
    #: step_key -> "completed" | "dismissed" | "started". Overrides/augments the
    #: derived status (e.g. mark a step done that isn't auto-detectable).
    marks: dict[str, str] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=utcnow)
