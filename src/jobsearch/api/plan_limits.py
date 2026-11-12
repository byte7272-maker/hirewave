"""Tiered limit enforcement (tester / trial / free).

Computes usage from the repos and enforces the :mod:`jobsearch.engines.plans` caps.
``tester`` is unlimited; ``trial`` (a new account's first ``settings.trial_days``) gets
liberal caps; ``free`` is the tighter ongoing baseline. Enforcement is globally gated by
``settings.plan_limits_enforced``.

Design rule: these limits **never block editing a résumé or a basic AI edit**. They meter
the cost / volume drivers (new documents, job sourcing, auto-applies, AI-edit *rate*) and
keep even those comfortably usable. There is no "paid" tier and no upgrade messaging.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status

from jobsearch.engines import plans
from jobsearch.models.common import utcnow


def _settings(state):
    return getattr(state, "settings", None)


def _tier(state, user) -> str:
    s = _settings(state)
    return plans.effective_tier(
        user,
        trial_days=getattr(s, "trial_days", plans.DEFAULT_TRIAL_DAYS) if s else plans.DEFAULT_TRIAL_DAYS,
        tester_emails=getattr(s, "tester_emails", []) if s else [],
        tester_domains=getattr(s, "tester_domains", []) if s else [],
    )


def effective_plan(state, user) -> str:
    """The active tier for a user (kept for back-compat with callers/tests)."""
    return _tier(state, user)


def _enforced(state) -> bool:
    s = _settings(state)
    return bool(getattr(s, "plan_limits_enforced", True)) if s else True


def _limits(state, user) -> Optional[dict[str, int]]:
    """Active caps for this user, or ``None`` when unlimited / enforcement is off."""
    if not _enforced(state):
        return None
    return plans.limits_for(_tier(state, user))


def _cap(state, user, key: str) -> Optional[int]:
    """One cap value, or ``None`` when uncapped. ``0`` also means uncapped."""
    L = _limits(state, user)
    if L is None:
        return None
    v = L.get(key)
    return None if not v else v


def _deny(resource: str, detail: str) -> None:
    # ``error`` stays "free_limit_reached" for frontend compatibility; messaging is
    # neutral (no "upgrade" / paid-plan wording).
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
        return ts.replace(tzinfo=None) >= since.replace(tzinfo=None)


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
    cap = _cap(state, user, "resumes")
    if cap is not None and _resumes_used(state, user) >= cap:
        _deny("resumes", f"Free accounts can keep up to {cap} résumés — archive one to add another.")


def enforce_new_cover_letter(state, user) -> None:
    cap = _cap(state, user, "cover_letters")
    if cap is not None and _cover_letters_used(state, user) >= cap:
        _deny("cover_letters", f"Free accounts can keep up to {cap} cover letters — archive one to add another.")


#: Absolute ceiling on connected email sources for EVERY user — applied regardless of
#: tier or whether plan enforcement is on (testers included). A user may connect several
#: addresses, up to this many.
EMAIL_SOURCES_HARD_CAP = 5


def email_sources_cap(state, user) -> int:
    """The effective max email sources for this user: the tier cap (if any) clamped to
    the absolute hard cap, and the hard cap even when the tier is unlimited."""
    tier_cap = _cap(state, user, "email_sources")
    return EMAIL_SOURCES_HARD_CAP if tier_cap is None else min(tier_cap, EMAIL_SOURCES_HARD_CAP)


def enforce_connect_source(state, user) -> None:
    cap = email_sources_cap(state, user)
    if _email_sources_used(state, user) >= cap:
        _deny(
            "email_sources",
            f"You can connect up to {cap} email sources — remove one to add another.",
        )


def enforce_autoapply(state, user) -> None:
    """Block a single auto-apply submission when a cap is hit."""
    day_cap = _cap(state, user, "autoapplies_per_day")
    week_cap = _cap(state, user, "autoapplies_per_week")
    if day_cap is not None and _autoapplies_day(state, user) >= day_cap:
        _deny("autoapplies", f"That's all {day_cap} auto-applies for today — they refresh tomorrow.")
    if week_cap is not None and _autoapplies_week(state, user) >= week_cap:
        _deny("autoapplies", f"That's all {week_cap} auto-applies for this week — they refresh next week.")


def autoapply_remaining(state, user) -> Optional[int]:
    """How many auto-applies are still allowed right now (for the batch wizard).
    ``None`` = unlimited."""
    day_cap = _cap(state, user, "autoapplies_per_day")
    week_cap = _cap(state, user, "autoapplies_per_week")
    if day_cap is None and week_cap is None:
        return None
    options = []
    if day_cap is not None:
        options.append(day_cap - _autoapplies_day(state, user))
    if week_cap is not None:
        options.append(week_cap - _autoapplies_week(state, user))
    return max(0, min(options))


def _ai_ledger_key(user) -> str:
    return f"aiedits:{user.id}"


def _ai_edits_today(state, user) -> int:
    """Count a user's AI edits in the last 24h (ledger in the document store)."""
    try:
        stored = state.documents.get(_ai_ledger_key(user))
    except Exception:  # noqa: BLE001 - no store -> can't count, treat as 0
        return 0
    if stored is None:
        return 0
    import json
    try:
        stamps = json.loads(stored[0].decode("utf-8", "ignore"))
    except Exception:  # noqa: BLE001 - corrupt ledger
        return 0
    cutoff = utcnow().timestamp() - 24 * 3600
    return sum(1 for t in stamps if isinstance(t, (int, float)) and t >= cutoff)


def _record_ai_edit(state, user) -> None:
    import json
    key = _ai_ledger_key(user)
    try:
        stored = state.documents.get(key)
        stamps = json.loads(stored[0].decode("utf-8", "ignore")) if stored else []
    except Exception:  # noqa: BLE001
        stamps = []
    cutoff = utcnow().timestamp() - 24 * 3600
    stamps = [t for t in stamps if isinstance(t, (int, float)) and t >= cutoff]
    stamps.append(utcnow().timestamp())
    try:
        state.documents.put(key, json.dumps(stamps).encode("utf-8"), content_type="application/json")
    except Exception:  # noqa: BLE001 - best effort
        pass


def consume_ai_edit(state, user) -> None:
    """Record one AI résumé/cover-letter edit and enforce the per-day *rate* cap. The
    cap is liberal (so basic AI editing always works) and absent for testers / when
    enforcement is off."""
    cap = _cap(state, user, "ai_edits_per_day")
    if cap is None:
        return
    if _ai_edits_today(state, user) >= cap:
        _deny("ai_edits", f"That's today's {cap} AI edits — they refresh tomorrow.")
    _record_ai_edit(state, user)


def enforce_ai_input(state, user, *texts: str) -> None:
    """Deliberately a no-op.

    We never block an AI edit on input size — editing and basic AI must always work. Free
    accounts are metered by résumé *word count* (see :func:`resume_word_limit`) and by the
    daily AI-edit *rate* (:func:`consume_ai_edit`), not by rejecting a request outright.
    Kept as a stable call site for the document routers.
    """
    return None


def resume_word_limit(state, user) -> Optional[int]:
    """Max words in a free résumé (a soft, advertised limit; ``None`` = no limit)."""
    return _cap(state, user, "resume_words")


def matches_cap(state, user) -> Optional[int]:
    """Max matches a user may be shown; ``None`` = unlimited."""
    return _cap(state, user, "matches_per_day")


def reap_remaining(state, user) -> Optional[int]:
    """How many more jobs a user may gather this month; ``None`` = unlimited."""
    cap = _cap(state, user, "reaped_per_month")
    if cap is None:
        return None
    return max(0, cap - _reaped_month(state, user))


# --- snapshot for GET /auth/me/plan -----------------------------------------
def snapshot(state, user) -> dict:
    tier = _tier(state, user)
    L = _limits(state, user)
    trial_days = getattr(_settings(state), "trial_days", plans.DEFAULT_TRIAL_DAYS)
    days_left = plans.trial_days_left(user, trial_days=trial_days)
    trial = {"days_left": days_left} if tier == plans.TRIAL and days_left is not None else None

    if L is None:  # tester / enforcement off
        return {
            "plan": tier,
            "tier": tier,
            "unlimited": True,
            "can_toggle_full": True,
            "simple_default": plans.simple_default(tier),
            "trial": trial,
            "limits": None,
            "remaining": None,
        }
    return {
        "plan": tier,
        "tier": tier,
        "unlimited": False,
        "can_toggle_full": plans.can_toggle_full(tier),
        "simple_default": plans.simple_default(tier),
        "trial": trial,
        "limits": L,
        "remaining": {
            "resumes": max(0, L["resumes"] - _resumes_used(state, user)),
            "cover_letters": max(0, L["cover_letters"] - _cover_letters_used(state, user)),
            "email_sources": max(0, L["email_sources"] - _email_sources_used(state, user)),
            "autoapplies_today": max(0, L["autoapplies_per_day"] - _autoapplies_day(state, user)),
            "autoapplies_week": max(0, L["autoapplies_per_week"] - _autoapplies_week(state, user)),
            "matches_per_day": L["matches_per_day"],
            "reaped_month": max(0, L["reaped_per_month"] - _reaped_month(state, user)),
            "ai_edits_today": max(0, L["ai_edits_per_day"] - _ai_edits_today(state, user)),
            "resume_words": L["resume_words"],
        },
    }
