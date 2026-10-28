"""Plan tiers and free-tier limits for the Simple experience.

Pure logic — no I/O. The API layer (``api/plan_limits.py``) computes usage from the
repos and enforces these at the relevant endpoints. Only the ``free`` plan is
capped; ``paid`` and ``tester`` are unlimited and get the full app.
"""

from __future__ import annotations

from typing import Optional

FREE = "free"
PAID = "paid"
TESTER = "tester"

#: Free-tier caps. ``*_per_day`` / ``*_per_week`` / ``*_per_month`` are rolling
#: windows (last 24h / 7d / 30d). Others are absolute counts.
FREE_LIMITS: dict[str, int] = {
    "resumes": 5,
    "cover_letters": 5,
    "matches_per_day": 10,
    "email_sources": 3,
    "autoapplies_per_day": 5,
    "autoapplies_per_week": 10,
    "reaped_per_month": 25,
}


def effective_plan(user, tester_emails: Optional[list[str]] = None) -> str:
    """The plan that actually applies to a user. A tester email always wins, so real
    test accounts get the full app no matter what's stored on them."""
    email = (getattr(user, "email", "") or "").strip().lower()
    if email and email in {e.strip().lower() for e in (tester_emails or [])}:
        return TESTER
    plan = (getattr(user, "plan", "") or FREE).strip().lower()
    return plan if plan in (FREE, PAID, TESTER) else FREE


def is_unlimited(plan: str) -> bool:
    """Paid and tester plans have no caps and the full feature set."""
    return plan in (PAID, TESTER)


def can_toggle_full(plan: str) -> bool:
    """Who may switch between the Simple and Full views (free is locked to Simple)."""
    return plan in (PAID, TESTER)


def free_limits() -> dict[str, int]:
    return dict(FREE_LIMITS)
