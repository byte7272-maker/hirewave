"""Admin analytics — the in-app operator dashboard's data layer.

Session-gated: only users whose email is in ``settings.admin_emails`` (the
``JOBSEARCH_ADMIN_EMAILS`` Railway variable) may read these. This is separate from the
header-token admin API in :mod:`jobsearch.api.routers.admin` — here the logged-in user's
JWT is the credential, so the dashboard can live inside the app.

Privacy: these endpoints expose plan, engagement **counts**, timestamps, and estimated
AI usage/cost only — never résumé/cover-letter/email **content** or job text. No account
is ever entered or impersonated; everything is computed server-side from the repos.

Revenue is a **projection** (configurable price per plan tier — the app is free today).
AI cost is an **estimate** (tokens approximated from text length × configurable rates).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from jobsearch.analytics import ai_usage, feature_activity
from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.engines import plans
from jobsearch.models.common import utcnow

router = APIRouter(prefix="/api/v1/admin", tags=["admin-analytics"])

_WORKER_HEALTHY_SECONDS = 900  # worker considered live if it ticked in the last 15 min


# --- gating ----------------------------------------------------------------
def _is_admin(state, user) -> bool:
    try:
        return state.settings.is_admin_email(user.email)
    except Exception:  # noqa: BLE001
        return False


def _require_admin(state, user) -> None:
    if not _is_admin(state, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


@router.get("/me")
def admin_me(user: CurrentUser, state: StateDep) -> dict:
    """Whether the signed-in user may see the admin dashboard (drives the nav/visibility).
    Returns 200 for everyone — non-admins just get ``is_admin: false``."""
    return {"is_admin": _is_admin(state, user), "email": user.email}


# --- per-user signals ------------------------------------------------------
def _tier(state, user) -> str:
    s = state.settings
    return plans.effective_tier(
        user,
        trial_days=getattr(s, "trial_days", plans.DEFAULT_TRIAL_DAYS),
        tester_emails=getattr(s, "tester_emails", []),
        tester_domains=getattr(s, "tester_domains", []),
    )


def _email_connected(state, user_id: str) -> bool:
    try:
        conns = state.integration.list_connections(user_id)
    except Exception:  # noqa: BLE001
        return False
    return any(
        (c.get("provider") in ("gmail", "google")) and not c.get("expired")
        for c in conns
    )


def _active_saved_search(state, user_id: str):
    try:
        searches = state.saved_searches_repo.find(user_id=user_id)
    except Exception:  # noqa: BLE001
        return None
    active = [s for s in searches if getattr(s, "active", False)]
    if not active:
        return None
    # the most recently run active search
    return max(active, key=lambda s: getattr(s, "last_run_at", None) or utcnow() - timedelta(days=3650))


def _count(find_result) -> int:
    try:
        return len(find_result)
    except Exception:  # noqa: BLE001
        return 0


def _user_row(state, user, jobs_by_owner: dict, now, in_rate: float, out_rate: float) -> dict:
    tier = _tier(state, user)
    owned = jobs_by_owner.get(user.id, [])
    real = [j for j in owned if not getattr(j, "is_sample", False)]
    newest = None
    if real:
        newest_dt = max((getattr(j, "first_seen_at", None) or getattr(j, "created_at", now)) for j in real)
        newest = round((now - newest_dt).total_seconds() / 3600.0, 1)

    apps = state.applications.find(user_id=user.id)
    submitted = sum(1 for a in apps if str(getattr(a.status, "value", a.status)) == "submitted")
    email_on = _email_connected(state, user.id)
    saved = _active_saved_search(state, user.id)
    search_on = saved is not None

    usage = ai_usage.usage_for(state.documents, user.id)
    est_cost = ai_usage.estimate_cost(usage, in_per_1k=in_rate, out_per_1k=out_rate)
    features = feature_activity.activity_for(state.documents, user.id)

    # Why might this user's matches look frozen? (ties the matches investigation in)
    flags = []
    if not email_on and not search_on:
        flags.append("matches_frozen_no_feeder")
    if not real:
        flags.append("no_real_jobs")
    prof = state.profile_for(user.id)
    if prof is not None and not prof.preferences.target_roles and not prof.preferences.job_categories:
        flags.append("no_search_criteria")

    last_run = getattr(saved, "last_run_at", None) if saved else None
    return {
        "user_id": user.id,
        "email": user.email,
        "tier": tier,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_active": user.updated_at.isoformat() if user.updated_at else None,
        "engagement": {
            "resumes": _count(state.resumes.find(user_id=user.id)),
            "cover_letters": _count(state.cover_letters.find(user_id=user.id)),
            "applications": len(apps),
            "applications_submitted": submitted,
            "email_connected": email_on,
            "active_saved_search": search_on,
            "saved_search_last_run": last_run.isoformat() if last_run else None,
            "matches_pool": len(owned),
            "matches_real": len(real),
            "newest_job_age_hours": newest,
        },
        "ai": {
            "ops": usage.get("ops", 0),
            "in_tokens": usage.get("in_tokens", 0),
            "out_tokens": usage.get("out_tokens", 0),
            "est_cost": est_cost,
        },
        # Per-feature interactions this month (how much they actually USE each core feature,
        # not how many artifacts they own). "total" is the sum across features.
        "features": features,
        "revenue_monthly": state.settings.plan_price(tier),
        "margin_monthly": round(state.settings.plan_price(tier) - est_cost, 4),
        "flags": flags,
    }


def _jobs_by_owner(state) -> dict:
    index: dict = {}
    try:
        for j in state.jobs.all():
            owner = getattr(j, "owner_id", "") or ""
            if owner:
                index.setdefault(owner, []).append(j)
    except Exception:  # noqa: BLE001
        pass
    return index


# --- endpoints -------------------------------------------------------------
@router.get("/analytics/users")
def analytics_users(
    user: CurrentUser,
    state: StateDep,
    tier: str = Query("", description="filter to one effective tier (tester/trial/free)"),
    limit: int = Query(500, ge=1, le=5000),
) -> list[dict]:
    """Per-user rows: plan, engagement counts, estimated AI usage/cost, flags."""
    _require_admin(state, user)
    now = utcnow()
    in_rate = state.settings.ai_cost_input_per_1k
    out_rate = state.settings.ai_cost_output_per_1k
    jbo = _jobs_by_owner(state)
    rows = []
    want = (tier or "").strip().lower()
    for u in sorted(state.users.all(), key=lambda x: getattr(x, "created_at", now)):
        row = _user_row(state, u, jbo, now, in_rate, out_rate)
        if want and row["tier"] != want:
            continue
        rows.append(row)
        if len(rows) >= limit:
            break
    return rows


@router.get("/analytics/overview")
def analytics_overview(user: CurrentUser, state: StateDep) -> dict:
    """Aggregate: user/tier counts, projected revenue, estimated AI cost (MTD),
    engagement rollups, and system health."""
    _require_admin(state, user)
    now = utcnow()
    s = state.settings
    in_rate, out_rate = s.ai_cost_input_per_1k, s.ai_cost_output_per_1k
    jbo = _jobs_by_owner(state)

    by_tier: dict[str, int] = {}
    revenue_by_tier: dict[str, dict] = {}
    active_7d = active_30d = email_connected = active_search = matches_frozen = 0
    total_ai_cost = 0.0
    total_ops = 0
    feature_totals = {f: 0 for f in feature_activity.FEATURES}

    users = list(state.users.all())
    for u in users:
        row = _user_row(state, u, jbo, now, in_rate, out_rate)
        t = row["tier"]
        for f in feature_activity.FEATURES:
            feature_totals[f] += row["features"].get(f, 0)
        by_tier[t] = by_tier.get(t, 0) + 1
        price = s.plan_price(t)
        slot = revenue_by_tier.setdefault(t, {"count": 0, "price": price, "subtotal": 0.0})
        slot["count"] += 1
        slot["subtotal"] = round(slot["count"] * price, 2)
        total_ai_cost += row["ai"]["est_cost"]
        total_ops += row["ai"]["ops"]
        if u.updated_at and (now - u.updated_at) <= timedelta(days=7):
            active_7d += 1
        if u.updated_at and (now - u.updated_at) <= timedelta(days=30):
            active_30d += 1
        if row["engagement"]["email_connected"]:
            email_connected += 1
        if row["engagement"]["active_saved_search"]:
            active_search += 1
        if "matches_frozen_no_feeder" in row["flags"]:
            matches_frozen += 1

    monthly_revenue = round(sum(v["subtotal"] for v in revenue_by_tier.values()), 2)

    # system health
    hb = None
    try:
        hb = state.worker_heartbeat.get("worker")
    except Exception:  # noqa: BLE001
        hb = None
    last_tick = getattr(hb, "last_tick_at", None) if hb else None
    secs_since = (now - last_tick).total_seconds() if last_tick else None
    worker_healthy = secs_since is not None and secs_since < _WORKER_HEALTHY_SECONDS

    return {
        "generated_at": now.isoformat(),
        "month": ai_usage.month_key(now),
        "totals": {"users": len(users), "by_tier": by_tier},
        "revenue": {
            "monthly_projected": monthly_revenue,
            "currency": "USD",
            "by_tier": revenue_by_tier,
            "note": "Projection from configurable plan prices (the app is free today).",
        },
        "ai_cost": {
            "month_to_date_est": round(total_ai_cost, 2),
            "ops": total_ops,
            "rates": {"input_per_1k": in_rate, "output_per_1k": out_rate},
            "note": "Estimated: tokens approximated from text length × configured rates.",
        },
        "margin": {"monthly_est": round(monthly_revenue - total_ai_cost, 2)},
        "engagement": {
            "active_7d": active_7d,
            "active_30d": active_30d,
            "email_connected": email_connected,
            "active_saved_search": active_search,
            "matches_frozen_no_feeder": matches_frozen,
            "feature_interactions": feature_totals,  # total interactions per core feature (MTD)
        },
        "system": {
            "scheduler_enabled": s.scheduler_enabled,
            "worker_last_tick": last_tick.isoformat() if last_tick else None,
            "worker_seconds_since": round(secs_since, 1) if secs_since is not None else None,
            "worker_healthy": worker_healthy,
            "worker_ticks": getattr(hb, "ticks", 0) if hb else 0,
            "job_source_mode": s.job_source_provider,  # "mock" | "http" (live)
            "gmail_fetch_mode": s.gmail_fetch,          # "mock" | "http" (live)
        },
    }
