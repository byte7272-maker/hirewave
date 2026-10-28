"""Free-tier limit enforcement for the Simple experience.

Computes usage from the repos and enforces the :mod:`jobsearch.engines.plans`
caps. Only the ``free`` plan is capped; ``paid``/``tester`` are unlimited, and
testers are resolved from ``settings.tester_emails`` so real test accounts always
get the full app. Enforcement is globally gated by ``settings.plan_limits_enforced``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status

from jobsearch.engines import plans
from jobsearch.models.common import utcnow


def _settings(state):
    return getattr(state, "settings", None)


def effective_plan(state, user) -> str:
    s = _settings(state)
    testers = getattr(s, "tester_emails", []) if s else []
    domains = getattr(s, "tester_domains", []) if s else []
    return plans.effective_plan(user, testers, domains)


def _enforced(state) -> bool:
    s = _settings(state)
    return bool(getattr(s, "plan_limits_enforced", True)) if s else True


def _is_free(state, user) -> bool:
    return _enforced(state) and effective_plan(state, user) == plans.FREE


def _deny(resource: str, detail: str) -> None:
    raise HTTPException(
        status.HTTP_402_PAYMENT_REQUIRED,
        detail={"error": "free_limit_reached", "resource": resource, "message": detail},
    )


# --- usage counters ---------------------------------------------------------
def _ge(ts: Optional[datetime], since: datetime) -> bool:
    if ts is None:
        return False
    try:
        return ts >= since
    except TypeError:  # mixed tz-aware/naive — compare naively
        a = ts.replace(tzinfo=None)
        b = since.replace(tzinfo=None)
        return a >= b


def _resumes_used(state, user) -> int:
    return len([
        r for r in state.resumes.find(user_id=user.id)
        if not getattr(r, "archived", False) and not getattr(r, "is_sample", False)
    ])


def _cover_letters_used(state, user) -> int:
    return len([
        c for c in state.cover_letters.find(user_id=user.id)
        if not getattr(c, "archived", False) and not getattr(c, "is_sample", False)
    ])


def _email_sources_used(state, user) -> int:
    try:
        conns = state.integration.list_connections(user.id)
    except Exception:  # noqa: BLE001 - no integrations configured
        return 0
    return len([c for c in conns if not c.get("expired")])


def _submitted_since(state, user, since: datetime) -> int:
    return sum(
        1 for a in state.applications.find(user_id=user.id)
        if _ge(getattr(a, "submitted_at", None), since)
    )


def _autoapplies_day(state, user) -> int:
    return _submitted_since(state, user, utcnow() - timedelta(days=1))


def _autoapplies_week(state, user) -> int:
    return _submitted_since(state, user, utcnow() - timedelta(days=7))


def _reaped_month(state, user) -> int:
    since = utcnow() - timedelta(days=30)
    return sum(
        1 for j in state.jobs.all()
        if getattr(j, "owner_id", "") == user.id
        and not getattr(j, "is_sample", False)  # seeded demo jobs don't count
        and _ge(getattr(j, "first_seen_at", None), since)
    )


# --- enforcement (called by routers before the limited action) --------------
def enforce_new_resume(state, user) -> None:
    cap = plans.FREE_LIMITS["resumes"]
    if _is_free(state, user) and _resumes_used(state, user) >= cap:
        _deny("resumes", f"You've reached the free limit of {cap} résumés. Upgrade to add more.")


def enforce_new_cover_letter(state, user) -> None:
    cap = plans.FREE_LIMITS["cover_letters"]
    if _is_free(state, user) and _cover_letters_used(state, user) >= cap:
        _deny("cover_letters", f"You've reached the free limit of {cap} cover letters. Upgrade to add more.")


def enforce_connect_source(state, user) -> None:
    cap = plans.FREE_LIMITS["email_sources"]
    if _is_free(state, user) and _email_sources_used(state, user) >= cap:
        _deny("email_sources", f"Free accounts can connect up to {cap} sources. Upgrade to connect more.")


def enforce_autoapply(state, user) -> None:
    """Block a single auto-apply submission when a free cap is hit."""
    if not _is_free(state, user):
        return
    day_cap = plans.FREE_LIMITS["autoapplies_per_day"]
    week_cap = plans.FREE_LIMITS["autoapplies_per_week"]
    if _autoapplies_day(state, user) >= day_cap:
        _deny("autoapplies", f"You've used your {day_cap} auto-applies for today. Upgrade to apply to more.")
    if _autoapplies_week(state, user) >= week_cap:
        _deny("autoapplies", f"You've reached the free limit of {week_cap} auto-applies this week. Upgrade for more.")


def autoapply_remaining(state, user) -> Optional[int]:
    """How many auto-applies are still allowed right now (for the batch wizard).
    None = unlimited."""
    if not _is_free(state, user):
        return None
    day_left = plans.FREE_LIMITS["autoapplies_per_day"] - _autoapplies_day(state, user)
    week_left = plans.FREE_LIMITS["autoapplies_per_week"] - _autoapplies_week(state, user)
    return max(0, min(day_left, week_left))


def matches_cap(state, user) -> Optional[int]:
    """Max matches a free user may be shown; None = unlimited."""
    return plans.FREE_LIMITS["matches_per_day"] if _is_free(state, user) else None


def reap_remaining(state, user) -> Optional[int]:
    """How many more jobs a free user may gather this month; None = unlimited."""
    if not _is_free(state, user):
        return None
    return max(0, plans.FREE_LIMITS["reaped_per_month"] - _reaped_month(state, user))


# --- snapshot for GET /auth/me/plan -----------------------------------------
def snapshot(state, user) -> dict:
    plan = effective_plan(state, user)
    if not _is_free(state, user):  # paid / tester / enforcement off
        return {
            "plan": plan,
            "unlimited": True,
            "can_toggle_full": True,
            "simple_default": False,
            "limits": None,
            "remaining": None,
        }
    L = plans.free_limits()
    return {
        "plan": plan,
        "unlimited": False,
        "can_toggle_full": False,
        "simple_default": True,
        "limits": L,
        "remaining": {
            "resumes": max(0, L["resumes"] - _resumes_used(state, user)),
            "cover_letters": max(0, L["cover_letters"] - _cover_letters_used(state, user)),
            "email_sources": max(0, L["email_sources"] - _email_sources_used(state, user)),
            "autoapplies_today": max(0, L["autoapplies_per_day"] - _autoapplies_day(state, user)),
            "autoapplies_week": max(0, L["autoapplies_per_week"] - _autoapplies_week(state, user)),
            "matches_per_day": L["matches_per_day"],
            "reaped_month": max(0, L["reaped_per_month"] - _reaped_month(state, user)),
        },
    }
