"""Real-time activity feed — a single per-user stream of what the app's automation /
AI is doing on the user's behalf, for the in-app "bubble" notifications.

This is a thin **aggregator**, not new storage. It merges:
  * the per-user :class:`Notification` stream (every engine already writes here), and
  * the auto-apply **pending-approval checkpoints** — sensitive actions the automation
    PREPARED but did NOT perform, awaiting the user's explicit OK.

Each item carries ``requires_action`` so the UI can distinguish a passive update ("scanned
your inbox, added 3 matches") from a checkpoint that needs a decision ("ready to apply to
X — approve?"). A ``mode`` block reports whether automation is actually **live** or merely
**simulated**, so the feed can only ever *claim* a real action when one truly happened —
the whole point is reassuring the user about their security and control.

Nothing here performs or authorizes an action. The action endpoints stay where they are
(``/notifications/*`` and ``/auto-apply/approvals/*``); this only *reports*.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query

from jobsearch.api.deps import CurrentUser, StateDep

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])

_WORKER_HEALTHY_SECONDS = 900  # worker considered live if it ticked in the last 15 min


def _parse_since(raw: str) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _after(ts: Optional[datetime], since: Optional[datetime]) -> bool:
    """Is ``ts`` strictly after ``since``? Tolerant of naive/aware mismatches."""
    if since is None:
        return True
    if ts is None:
        return False
    try:
        return ts > since
    except TypeError:  # one aware, one naive — compare naively
        a = ts.replace(tzinfo=None)
        b = since.replace(tzinfo=None)
        return a > b


def _category(type_value: str) -> str:
    """Group an event for the UI (icon/colour), robust to the exact enum spelling."""
    v = (type_value or "").lower()
    if any(k in v for k in ("reauth", "verification", "exposure", "security")):
        return "security"
    if "application" in v or "submit" in v:
        return "application"
    if "match" in v:
        return "matches"
    if "document" in v:
        return "document"
    return "system"


def _notification_requires_action(type_value: str) -> bool:
    """Only a notification that the user must act on (e.g. reconnect an expired inbox)
    is a checkpoint. Everything else is a passive update."""
    v = (type_value or "").lower()
    return "reauth" in v  # REAUTH_REQUIRED — the inbox/site needs reconnecting


def _iso(dt) -> Optional[str]:
    try:
        return dt.isoformat()
    except Exception:  # noqa: BLE001
        return None


@router.get("")
def get_activity(
    user: CurrentUser,
    state: StateDep,
    since: str = Query("", description="ISO timestamp — return only notifications newer than this (checkpoints are always included)"),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    """The user's recent AI/automation activity, newest-first, as feed items.

    Pass ``since`` for incremental polling (notifications only; pending checkpoints are
    always returned so the UI never loses track of an action awaiting approval)."""
    now = datetime.now(timezone.utc)
    s = state.settings
    cutoff = _parse_since(since)
    items: list[dict] = []

    # --- notifications (passive updates + reconnect prompts) -----------------
    unread = 0
    try:
        notes = state.notifications.find(user_id=user.id)
    except Exception:  # noqa: BLE001
        notes = []
    notes = sorted(notes, key=lambda n: getattr(n, "created_at", now), reverse=True)[: max(limit, 1)]
    for n in notes:
        tval = getattr(getattr(n, "type", None), "value", str(getattr(n, "type", "")))
        read = bool(getattr(n, "is_read", False))
        if not read:
            unread += 1
        if not _after(getattr(n, "created_at", None), cutoff):
            continue
        items.append({
            "id": getattr(n, "id", ""),
            "kind": "notification",
            "type": tval,
            "category": _category(tval),
            "message": getattr(n, "message", ""),
            "at": _iso(getattr(n, "created_at", None)),
            "read": read,
            "requires_action": _notification_requires_action(tval),
        })

    # --- pending-approval checkpoints (ALWAYS included) ----------------------
    # Sensitive actions the automation prepared but did NOT perform — each needs the
    # user's explicit approval. This is the reused "prepare -> queue -> approve" gate.
    live_submit = bool(getattr(s, "auto_apply_live_submit", False))
    pending = []
    try:
        pending = list(state.auto_apply.pending_approvals(user.id))
    except Exception:  # noqa: BLE001
        pending = []
    for a in pending:
        job = None
        try:
            job = state.jobs.get(getattr(a, "job_posting_id", ""))
        except Exception:  # noqa: BLE001
            job = None
        title = getattr(job, "title", "") if job else ""
        company = getattr(job, "company", "") if job else ""
        pr = getattr(a, "platform_response", {}) or {}
        provider = pr.get("provider", "")
        aid = getattr(a, "id", "")
        label = f"{title} at {company}".strip(" at ") or "an application"
        items.append({
            "id": f"approval:{aid}",
            "kind": "checkpoint",
            "type": "needs_approval",
            "category": "application",
            "message": f"Ready to apply to {label} — needs your approval before anything is sent.",
            "at": _iso(getattr(a, "created_at", None)),
            "read": False,
            "requires_action": True,
            "action": {
                "kind": "auto_apply_approval",
                "application_id": aid,
                "title": title,
                "company": company,
                "provider": provider,
                "approve": f"/api/v1/auto-apply/approvals/{aid}/approve",
                "reject": f"/api/v1/auto-apply/approvals/{aid}/reject",
                # On approve, will it be really sent, or filled-and-held (test mode)?
                "will_submit_for_real": live_submit,
            },
        })

    items.sort(key=lambda it: (it.get("at") or ""), reverse=True)
    pending_action_count = sum(1 for it in items if it.get("requires_action"))

    # --- worker liveness (is the AI actually working right now?) -------------
    hb = None
    try:
        hb = state.worker_heartbeat.get("worker")
    except Exception:  # noqa: BLE001
        hb = None
    last_tick = getattr(hb, "last_tick_at", None) if hb else None
    secs_since = None
    if last_tick is not None:
        lt = last_tick if last_tick.tzinfo else last_tick.replace(tzinfo=timezone.utc)
        secs_since = max(0, int((now - lt).total_seconds()))
    worker_healthy = secs_since is not None and secs_since < _WORKER_HEALTHY_SECONDS

    return {
        "generated_at": now.isoformat(),
        "items": items,
        "pending_action_count": pending_action_count,
        "unread_count": unread,
        # The honesty block: whether each automation is LIVE or only SIMULATED, so the UI
        # can badge "simulated — nothing was sent" and never overstate what the AI did.
        "mode": {
            "automation_live": getattr(s, "automation_mode", "simulate") == "live",
            "submit_live": live_submit,
            "email_scan_live": getattr(s, "gmail_fetch", "mock") == "http",
            "sourcing_live": getattr(s, "job_source_provider", "mock") == "http",
            "worker_active": worker_healthy,
        },
    }
