"""A once-per-session proactive scan: what the assistant should raise on its own.

On landing, instead of waiting to be asked, the assistant checks three things and
surfaces anything worth the user's attention, highest-priority first:

1. a **severe, unresolved error** from a previous turn/session (so a failure isn't
   silently dropped),
2. **reportable items** — things the app noticed that the user should act on (a stale
   summary, bullets with dated figures, …), computed by the caller and passed in, and
3. a short **recent-activity** recap ("since last time you …").

Deterministic and read-only — it never changes anything; it returns a prioritized brief
+ a single spoken lead. The caller runs it once per session (see the endpoint's
``session_id`` de-dupe).
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from jobsearch.engines.assistant import activity_log as al
from jobsearch.engines.assistant import troubleshooting as ts

#: Error kinds worth raising proactively if they were left unresolved — real failures,
#: not a bad mic read or nonsense (those are re-asks, handled live, never surfaced later).
SEVERE_KINDS = {
    "network", "timeout", "session_expired", "permission_denied", "not_linked",
    "no_site_access", "no_sources_fetched", "no_document_text", "rate_limited", "unknown",
}


def is_severe(kind: str) -> bool:
    return (kind or "").strip().lower() in SEVERE_KINDS


def _recent_severe_error(errors: list):
    unresolved = [e for e in errors
                  if not getattr(e, "resolved", False) and is_severe(getattr(e, "kind", ""))]
    if not unresolved:
        return None
    return sorted(unresolved, key=lambda e: e.at, reverse=True)[0]


def scan(*, errors: Optional[Iterable] = None, activity_events: Optional[Iterable] = None,
         reportables: Optional[list[dict]] = None) -> dict[str, Any]:
    """Build the proactive brief. ``reportables`` are caller-computed items, each
    ``{severity, title, message, action?}``. Returns::

        {count, items[], speak, has_error, has_reportable, has_activity}

    ``items`` are ordered error → reportables → activity. ``speak`` is one ready line."""
    errors = list(errors or [])
    reportables = list(reportables or [])
    items: list[dict] = []

    err = _recent_severe_error(errors)
    err_info = None
    if err is not None:
        err_info = ts.lookup(err.kind)
        items.append({
            "kind": "error", "severity": "high",
            "title": err_info.get("ack", "Something went wrong earlier."),
            "message": err_info.get("fix", ""),
            "error_kind": err.kind,
            "at": err.at.isoformat() if hasattr(err.at, "isoformat") else str(err.at),
        })

    for r in reportables:
        items.append({
            "kind": "reportable", "severity": r.get("severity", "medium"),
            "title": r.get("title", ""), "message": r.get("message", ""),
            "action": r.get("action"),
        })

    summ = al.summarize(list(activity_events or []))
    activity_line = ""
    if summ["total"]:
        recent = summ["recent"][:2]
        activity_line = "Since last time: " + al._join([al._recent_phrase(x) for x in recent]) + "."
        items.append({"kind": "activity", "severity": "info",
                      "title": "Recent activity", "message": activity_line})

    # One spoken lead — most important first, kept short.
    parts: list[str] = []
    if err_info is not None:
        parts.append("heads up — " + err_info.get("ack", "something went wrong earlier").rstrip("."))
    if reportables:
        parts.append(reportables[0].get("message", "").rstrip("."))
    if activity_line:
        parts.append(activity_line.rstrip("."))
    speak = ("Welcome back. " + "; ".join(p for p in parts if p) + "."
             if parts else "Welcome back — you're all caught up.")

    return {
        "count": len(items), "items": items, "speak": speak,
        "has_error": err is not None,
        "has_reportable": bool(reportables),
        "has_activity": bool(summ["total"]),
    }
