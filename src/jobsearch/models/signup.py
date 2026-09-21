"""Signup invites — the permission tokens that gate account creation in invite mode."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class SignupInvite(DomainModel):
    """A code that authorizes creating an account while signups are gated. Single-use
    by default, optionally multi-use and/or expiring, and revocable."""

    id: str = Field(default_factory=lambda: new_id("inv_"))
    code: str = ""  # the shareable secret
    label: str = ""  # who/what it's for (e.g. "beta tester Jane")
    max_uses: int = 1
    uses: int = 0
    active: bool = True
    used_by: list[str] = Field(default_factory=list)  # emails that redeemed it
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)

    def is_valid(self, *, at: Optional[datetime] = None) -> bool:
        at = at or utcnow()
        if not self.active:
            return False
        if self.expires_at is not None and at >= self.expires_at:
            return False
        return self.uses < self.max_uses
