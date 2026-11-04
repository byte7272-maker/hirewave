"""Account tiers and their limits.

Pure logic — no I/O. The API layer (:mod:`jobsearch.api.plan_limits`) computes usage
from the repos and enforces these caps. Three tiers:

- ``tester`` — the full app, unlimited, forever. Assigned by an operator through the
  admin API (single or bulk), or by an optional email/domain allowlist.
- ``trial`` — a brand-new account's first ``trial_days`` (default 30). The full app
  with *liberal* caps on the costly / high-volume features (AI edits, auto-applies,
  job sourcing) so a new user can feel the value without us running up AI cost.
- ``free`` — the ongoing baseline after the trial. Résumé editing and AI always work
  in basic, functional ways; ``free`` just adds a résumé word-count limit and tighter
  volume caps.

Guiding rule: **nothing here blocks editing a résumé or running a basic AI edit.**
Tiers only meter the cost / volume drivers, and even those stay comfortably usable.
There is no "paid" tier — access is tester / trial / free only.
"""

from __future__ import annotations

from typing import Optional

from jobsearch.models.common import utcnow

TESTER = "tester"
TRIAL = "trial"
FREE = "free"
AUTO = ""  # stored sentinel: no explicit override → decide by account age

#: Legacy stored value. Any account still marked "paid" is treated as a tester so it
#: never loses access; the word "paid" is not used anywhere user-facing.
_LEGACY_FULL = "paid"

DEFAULT_TRIAL_DAYS = 30

#: Per-tier caps. ``0`` (or a missing key) means *unlimited* for that dimension.
#: ``*_per_day`` / ``*_per_week`` / ``*_per_month`` are rolling windows (24h / 7d / 30d).
TIER_LIMITS: dict[str, dict[str, int]] = {
    TRIAL: {
        "resumes": 20,
        "cover_letters": 20,
        "matches_per_day": 50,
        "email_sources": 5,
        "autoapplies_per_day": 10,
        "autoapplies_per_week": 30,
        "reaped_per_month": 200,
        "ai_edits_per_day": 100,   # generous — the trial should feel like the full app
        "resume_words": 0,         # no résumé length cap during the trial
    },
    FREE: {
        "resumes": 5,
        "cover_letters": 5,
        "matches_per_day": 20,
        "email_sources": 2,
        "autoapplies_per_day": 3,
        "autoapplies_per_week": 10,
        "reaped_per_month": 50,
        "ai_edits_per_day": 40,    # liberal — basic AI editing always works
        "resume_words": 1500,      # a free résumé's length cap (~2 pages)
    },
}

#: Back-compat: some callers/tests still read ``FREE_LIMITS``.
FREE_LIMITS = TIER_LIMITS[FREE]


def _age_days(user, now) -> Optional[float]:
    created = getattr(user, "created_at", None)
    if created is None:
        return None
    now = now or utcnow()
    try:
        return (now - created).total_seconds() / 86400.0
    except TypeError:  # mixed tz-aware / naive
        return (now.replace(tzinfo=None) - created.replace(tzinfo=None)).total_seconds() / 86400.0


def effective_tier(
    user,
    *,
    now=None,
    trial_days: int = DEFAULT_TRIAL_DAYS,
    tester_emails: Optional[list[str]] = None,
    tester_domains: Optional[list[str]] = None,
) -> str:
    """The tier that actually applies to a user.

    Explicit overrides win (``tester`` / ``free`` / ``trial`` stored on the account, set
    via the admin API). An optional email/domain allowlist also grants ``tester``. With
    no override, a young account is on the ``trial`` and an older one is ``free``.
    """
    stored = (getattr(user, "plan", "") or "").strip().lower()
    if stored in (TESTER, _LEGACY_FULL):
        return TESTER

    email = (getattr(user, "email", "") or "").strip().lower()
    if email:
        if email in {e.strip().lower() for e in (tester_emails or [])}:
            return TESTER
        domain = email.rsplit("@", 1)[-1] if "@" in email else ""
        if domain and domain in {d.strip().lower().lstrip("@") for d in (tester_domains or [])}:
            return TESTER

    if stored == FREE:
        return FREE
    if stored == TRIAL:
        return TRIAL

    # AUTO: brand-new accounts get the trial; afterwards, free.
    age = _age_days(user, now)
    if age is not None and trial_days > 0 and age <= trial_days:
        return TRIAL
    return FREE


def effective_plan(
    user,
    tester_emails: Optional[list[str]] = None,
    tester_domains: Optional[list[str]] = None,
    *,
    now=None,
    trial_days: int = DEFAULT_TRIAL_DAYS,
) -> str:
    """Back-compat alias for :func:`effective_tier` (positional allowlists)."""
    return effective_tier(
        user, now=now, trial_days=trial_days,
        tester_emails=tester_emails, tester_domains=tester_domains,
    )


def is_unlimited(tier: str) -> bool:
    """Only testers are uncapped."""
    return tier == TESTER


def can_toggle_full(tier: str) -> bool:
    """Nobody is locked out of the full app — free just *defaults* to Simple."""
    return True


def simple_default(tier: str) -> bool:
    """Which tiers open in the Simple view by default."""
    return tier == FREE


def limits_for(tier: str) -> Optional[dict[str, int]]:
    """The caps for a tier, or ``None`` when unlimited (tester)."""
    if tier == TESTER:
        return None
    return dict(TIER_LIMITS.get(tier, TIER_LIMITS[FREE]))


def trial_days_left(user, *, now=None, trial_days: int = DEFAULT_TRIAL_DAYS) -> Optional[int]:
    """Whole days left in an age-based trial, or ``None`` when not on a trial."""
    stored = (getattr(user, "plan", "") or "").strip().lower()
    if stored in (TESTER, FREE, _LEGACY_FULL):
        return None
    age = _age_days(user, now)
    if age is None or trial_days <= 0 or age > trial_days:
        return None
    return max(0, int(trial_days - age))


def free_limits() -> dict[str, int]:
    return dict(TIER_LIMITS[FREE])
