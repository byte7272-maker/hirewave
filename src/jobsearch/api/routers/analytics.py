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
from pydantic import BaseModel

from jobsearch.analytics import ai_usage, feature_activity
from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.engines import plans
from jobsearch.engines.sourcing.imap_source import is_imap_provider
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
    """Whether the user has a working email FEEDER connected — Gmail (OAuth) or an
    IMAP mailbox (iCloud). Both feed job email into matches, so both must count here;
    otherwise an iCloud-connected user is wrongly flagged ``matches_frozen_no_feeder``."""
    try:
        conns = state.integration.list_connections(user_id)
    except Exception:  # noqa: BLE001
        return False
    return any(
        (c.get("provider") in ("gmail", "google") or is_imap_provider(c.get("provider", "")))
        and not c.get("expired")
        for c in conns
    )


def _email_feeders(state, user_id: str) -> list[str]:
    """The provider names of the user's connected email feeders (e.g. ["gmail","icloud"]),
    so the dashboard can show WHICH inbox types are connected, not just a yes/no."""
    try:
        conns = state.integration.list_connections(user_id)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for c in conns:
        p = c.get("provider", "")
        if (p in ("gmail", "google") or is_imap_provider(p)) and not c.get("expired"):
            out.append(p)
    return sorted(set(out))


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
    email_feeders = _email_feeders(state, user.id)
    email_on = bool(email_feeders)
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
        # True when the email's domain is a configured seed/test domain (test.dev,
        # example.com, *.local, …) — so the dashboard can separate real users from the
        # load-test/seed accounts that accumulate in production.
        "is_test": state.settings.is_test_user_email(user.email),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_active": user.updated_at.isoformat() if user.updated_at else None,
        "engagement": {
            "resumes": _count(state.resumes.find(user_id=user.id)),
            "cover_letters": _count(state.cover_letters.find(user_id=user.id)),
            "applications": len(apps),
            "applications_submitted": submitted,
            "email_connected": email_on,
            # WHICH email inboxes feed this user's matches (gmail / icloud / …).
            "email_providers": email_feeders,
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
    exclude_test: bool = Query(False, description="hide seed/test-domain accounts (test.dev, *.local, …)"),
) -> list[dict]:
    """Per-user rows: plan, engagement counts, estimated AI usage/cost, flags.
    Pass ``exclude_test=true`` to hide seed/test-domain accounts and see only real users."""
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
        if exclude_test and row["is_test"]:
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
    by_tier_real: dict[str, int] = {}
    revenue_by_tier: dict[str, dict] = {}
    active_7d = active_30d = email_connected = active_search = matches_frozen = 0
    test_users = 0
    total_ai_cost = 0.0
    total_ops = 0
    feature_totals = {f: 0 for f in feature_activity.FEATURES}
    email_provider_counts: dict[str, int] = {}

    users = list(state.users.all())
    for u in users:
        row = _user_row(state, u, jbo, now, in_rate, out_rate)
        t = row["tier"]
        is_test = row.get("is_test", False)
        for f in feature_activity.FEATURES:
            feature_totals[f] += row["features"].get(f, 0)
        by_tier[t] = by_tier.get(t, 0) + 1
        if is_test:
            test_users += 1
        else:
            by_tier_real[t] = by_tier_real.get(t, 0) + 1
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
        for p in row["engagement"].get("email_providers", []):
            email_provider_counts[p] = email_provider_counts.get(p, 0) + 1
        if row["engagement"]["active_saved_search"]:
            active_search += 1
        if "matches_frozen_no_feeder" in row["flags"]:
            matches_frozen += 1

    real_users = len(users) - test_users

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
        "totals": {
            "users": len(users),
            "by_tier": by_tier,
            # Real vs seed/test accounts, so the headline isn't inflated by load-test /
            # seed data (test.dev, example.com, *.local, …). Test accounts are still
            # counted in "users"; these split it out.
            "real_users": real_users,
            "test_users": test_users,
            "by_tier_real": by_tier_real,
        },
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
            # How many users feed matches from each inbox type (gmail / icloud / …).
            "email_providers": email_provider_counts,
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


# --- maintenance: prune seed/test accounts ---------------------------------
class PruneAccountsRequest(BaseModel):
    #: DRY RUN unless true. When false, returns exactly what WOULD be deleted.
    confirm: bool = False
    #: Select accounts whose email domain is a configured test domain (test.dev, *.local…).
    test_domains: bool = True
    #: Also select one exact email domain (e.g. "test.dev") — narrows to just that one.
    domain: Optional[str] = None
    #: Explicit emails to delete (combined with the above selectors).
    emails: Optional[list[str]] = None
    #: Safety cap: refuse to execute if the selection exceeds this many accounts.
    max_delete: int = 200


@router.post("/accounts/prune")
def prune_accounts(body: PruneAccountsRequest, user: CurrentUser, state: StateDep) -> dict:
    """Delete seed/test accounts (and their data) in bulk — operator cleanup for the
    load-test/seed accounts that inflate the user count. **Dry run by default**: returns
    the count + sample of what WOULD be deleted. Pass ``confirm=true`` to actually delete.

    Guardrails: admin and tester emails are NEVER deleted here (protected), the caller's
    own account is never deleted, and a ``max_delete`` cap refuses an over-broad confirm.
    Selection = test-domain accounts by default; narrow with ``domain`` or an explicit
    ``emails`` list to remove only *some*. Uses the same cascade as self-serve deletion."""
    _require_admin(state, user)
    s = state.settings
    protected = {e.lower() for e in s.admin_emails}
    protected |= {e.lower() for e in getattr(s, "tester_emails", [])}
    protected.add((user.email or "").lower())  # never delete yourself via bulk prune

    domain = (body.domain or "").strip().lower().lstrip("@")
    wanted = {e.strip().lower() for e in (body.emails or []) if e.strip()}

    targets = []
    protected_skipped = 0
    for u in state.users.all():
        email = (u.email or "").lower()
        selected = (
            (bool(wanted) and email in wanted)
            or (bool(domain) and email.endswith("@" + domain))
            or (body.test_domains and s.is_test_user_email(email))
        )
        if not selected:
            continue
        if email in protected:
            protected_skipped += 1
            continue
        targets.append(u)

    deleted = 0
    if body.confirm:
        if len(targets) > body.max_delete:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"selection of {len(targets)} accounts exceeds max_delete={body.max_delete}; "
                "narrow the selection (domain/emails) or raise max_delete to proceed",
            )
        from jobsearch.api.routers.auth import wipe_user
        for u in targets:
            try:
                wipe_user(state, u.id)
                deleted += 1
            except Exception:  # noqa: BLE001 - never let one account block the rest
                pass

    return {
        "dry_run": not body.confirm,
        "matched": len(targets),
        "deleted": deleted,
        "protected_skipped": protected_skipped,
        "sample": [u.email for u in targets[:50]],
    }


# --- migrate one account's data to another ---------------------------------
class MigrateAccountRequest(BaseModel):
    from_email: str
    to_email: str
    #: DRY RUN unless true. When false, moves the data.
    confirm: bool = False
    #: After moving, permanently delete the (now-empty) source account.
    delete_source: bool = False


@router.post("/accounts/migrate")
def migrate_account(body: MigrateAccountRequest, user: CurrentUser, state: StateDep) -> dict:
    """Move one account's documents + settings to another (e.g. a user re-created under a
    different email). Reassigns every user-scoped record (résumés, cover letters, profile,
    applications, saved searches, highlights, onboarding, view-state, …) and owned postings
    from the source to the target. **Dry run by default**: returns what WOULD move. Pass
    ``confirm=true`` to move it; ``delete_source=true`` to remove the emptied source after.

    The target account must already exist (sign into it first). Connected integrations
    (email/job-site sessions) are NOT moved — their secrets are bound to the source account's
    encryption; re-connect them on the target. Intended for operator-run account recovery."""
    _require_admin(state, user)
    src = state.user_by_email((body.from_email or "").strip().lower()) if body.from_email else None
    dst = state.user_by_email((body.to_email or "").strip().lower()) if body.to_email else None
    if src is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"source account not found: {body.from_email}")
    if dst is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"target account not found: {body.to_email} — create/sign into it first")
    if src.id == dst.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "source and target are the same account")

    from jobsearch.api.routers.auth import _USER_SCOPED_REPOS, wipe_user

    def _find(repo, uid):
        try:
            return list(repo.find(user_id=uid))
        except Exception:  # noqa: BLE001
            return []

    would: dict[str, int] = {}
    for name in _USER_SCOPED_REPOS:
        repo = getattr(state, name, None)
        would[name] = len(_find(repo, src.id)) if repo is not None else 0
    owned_jobs = []
    try:
        owned_jobs = [j for j in state.jobs.all() if getattr(j, "owner_id", "") == src.id]
    except Exception:  # noqa: BLE001
        owned_jobs = []
    would["jobs"] = len(owned_jobs)
    total = sum(would.values())

    if not body.confirm:
        return {
            "dry_run": True, "from": src.email, "to": dst.email,
            "would_move": {k: v for k, v in would.items() if v}, "total_records": total,
            "note": "Integrations/sessions are NOT moved — re-connect them on the target account.",
        }

    moved: dict[str, int] = {}
    for name in _USER_SCOPED_REPOS:
        repo = getattr(state, name, None)
        if repo is None:
            continue
        recs = _find(repo, src.id)
        # profiles are 1:1 — clear the target's (empty) profile first so there's exactly one.
        if name == "profiles" and recs:
            for t in _find(repo, dst.id):
                try:
                    repo.delete(t.id)
                except Exception:  # noqa: BLE001
                    pass
        n = 0
        for r in recs:
            try:
                r.user_id = dst.id
                repo.add(r)  # same id, new owner (upsert)
                n += 1
            except Exception:  # noqa: BLE001
                pass
        if n:
            moved[name] = n
    jn = 0
    for j in owned_jobs:
        try:
            j.owner_id = dst.id
            state.jobs.add(j)
            jn += 1
        except Exception:  # noqa: BLE001
            pass
    if jn:
        moved["jobs"] = jn

    deleted_source = False
    if body.delete_source:
        try:
            wipe_user(state, src.id)
            deleted_source = True
        except Exception:  # noqa: BLE001
            pass

    return {
        "dry_run": False, "from": src.email, "to": dst.email,
        "moved": moved, "total_moved": sum(moved.values()), "deleted_source": deleted_source,
        "note": "Integrations/sessions were NOT moved — re-connect them on the target account.",
    }
