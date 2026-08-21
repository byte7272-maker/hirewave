"""Standing auto-apply — a *connected browser session* plus a *pre-authorized*
grant that lets the assistant submit to specific jobs or whole groups without a
per-application click.

Two entities:

* :class:`BrowserSession` — a session the user established themselves on a
  provider (LinkedIn/Indeed/…). We store only the Playwright ``storage_state``
  (cookies), **encrypted at rest** — never the password. Captured by the local
  ``python -m jobsearch.connect`` helper so the password never leaves the user's
  machine.
* :class:`AutoApplyGrant` — the user's explicit, bounded pre-permission to
  auto-submit: a scope (named jobs, or criteria matching a group), plus hard
  limits (total cap, per-day cap, expiry, verified-only) so "as automated as
  possible" stays inside guardrails the user set.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class BrowserSession(DomainModel):
    """A user-established provider session (cookies only, encrypted)."""

    id: str = Field(default_factory=lambda: new_id("bsess_"))
    user_id: str
    provider: str = ""  # "linkedin" | "indeed" | ...
    #: AES-GCM ciphertext of the Playwright storage_state JSON (never plaintext).
    storage_state: str = ""
    label: str = ""  # e.g. the account email, for the user to recognize it
    status: str = "active"  # active | expired | revoked
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AutoApplyCriteria(DomainModel):
    """A group rule — a job matches when it satisfies every set constraint."""

    title_keywords: list[str] = Field(default_factory=list)  # any keyword in title
    locations: list[str] = Field(default_factory=list)  # any substring in location
    remote: Optional[bool] = None  # require remote / on-site when set
    companies_allow: list[str] = Field(default_factory=list)  # only these companies
    companies_deny: list[str] = Field(default_factory=list)  # never these companies
    sources: list[str] = Field(default_factory=list)  # source_platform allow-list
    min_fit_score: Optional[float] = None  # require match_score >= this (0-100)


# Grant lifecycle states.
GRANT_ACTIVE = "active"
GRANT_PAUSED = "paused"
GRANT_EXHAUSTED = "exhausted"  # hit max_submits
GRANT_EXPIRED = "expired"
GRANT_REVOKED = "revoked"


class AutoApplyGrant(DomainModel):
    """Standing authorization to auto-submit within a scope and hard limits."""

    id: str = Field(default_factory=lambda: new_id("grant_"))
    user_id: str
    name: str = ""

    # Scope: an explicit list of jobs, or a criteria group.
    scope: str = "criteria"  # "jobs" | "criteria"
    job_ids: list[str] = Field(default_factory=list)
    criteria: AutoApplyCriteria = Field(default_factory=AutoApplyCriteria)

    # How submission happens:
    #   "auto"     — the assistant fills AND submits server-side (within limits).
    #   "assisted" — the assistant lists the jobs; the user clicks the provider's
    #                Apply button themselves, then automation fills the open form.
    # ToS-sensitive providers (e.g. LinkedIn) are always treated as "assisted"
    # regardless of this setting — the human initiates every application there.
    mode: str = "auto"  # "auto" | "assisted"

    # Scheduling: 0 = manual only; > 0 = auto-run on this cadence.
    interval_minutes: int = 0

    # Safety limits.
    require_verified: bool = True  # only apply to postings verified real
    max_submits: int = 10  # total cap for the life of the grant
    daily_cap: int = 5  # per-calendar-day cap
    expires_at: Optional[datetime] = None

    # Counters (managed by the engine).
    submits_used: int = 0
    submitted_today: int = 0
    day_marker: str = ""  # YYYY-MM-DD the submitted_today count belongs to

    status: str = GRANT_ACTIVE
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_run_at: Optional[datetime] = None

    @property
    def remaining_total(self) -> int:
        return max(0, self.max_submits - self.submits_used)
