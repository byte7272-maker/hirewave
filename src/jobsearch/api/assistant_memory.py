"""Server-side memory of the assistant's pending yes/no OFFERS, per user.

The interpreter is stateless, so a bare "yes" (especially from the badge, which sends no
page context) can't know which question is live. This small, in-process store fixes that and
adds the behavior the badge needs for SPOKEN interaction:

* **One ACTIVE offer at a time** — the single question a bare "yes"/"no" answers. The badge
  deals with one spoken thing at a time, so there is never more than one answerable offer.
* **A bounded cache of older, unanswered offers** — when a new offer is made or the user does
  something else instead of answering, the previous offer isn't lost: it's remembered (up to
  a small, conservative limit) so the assistant can give a clean reminder of what's still
  pending, with the option to dismiss each one.
* **Timeouts** so offers don't accumulate — the active offer is answerable briefly; cached
  reminders live a while longer, then expire.

It is a hint, not durable state: in-process, per user, and self-pruning. Works for EVERY
area, not just matches — anything that records an offer (interpret/observe responses, loading
a page whose primary action is obvious) flows through here.
"""

from __future__ import annotations

import time
from typing import Any, Optional

#: How long a bare "yes"/"no" can still answer the ACTIVE offer.
ACTIVE_TTL_SECONDS = 600
#: How long an unanswered offer is remembered as a dismissible reminder.
QUEUE_TTL_SECONDS = 1800
#: Conservative cap on remembered reminders, so they never pile up.
MAX_PENDING = 5


def _sig(on_yes: dict) -> str:
    """A stable id for an offer's action, so the same offer de-dupes and can be dismissed."""
    intent = str((on_yes or {}).get("intent") or "")
    slots = (on_yes or {}).get("slots") or {}
    body = ",".join(f"{k}={slots[k]}" for k in sorted(slots))
    return f"{intent}:{body}"


def _entry(state, user_id: str) -> dict:
    store = getattr(state, "_assistant_offers", None)
    if store is None:
        store = {}
        try:
            setattr(state, "_assistant_offers", store)
        except Exception:  # noqa: BLE001 — state may forbid new attrs; memory just won't persist
            return {"active": None, "queue": []}
    return store.setdefault(user_id, {"active": None, "queue": []})


def _prune(entry: dict) -> None:
    now = time.time()
    act = entry.get("active")
    if act and now - float(act.get("t", 0)) > ACTIVE_TTL_SECONDS:
        # An expired-but-recent active still counts as an unanswered reminder for a while.
        if now - float(act.get("t", 0)) <= QUEUE_TTL_SECONDS:
            _push_queue(entry, act)
        entry["active"] = None
    entry["queue"] = [q for q in entry.get("queue", [])
                      if now - float(q.get("t", 0)) <= QUEUE_TTL_SECONDS]


def _push_queue(entry: dict, offer: dict) -> None:
    """Move an unanswered offer into the reminder queue (newest last), de-duped and capped."""
    oid = offer.get("id") or _sig(offer.get("on_yes") or {})
    entry["queue"] = [q for q in entry.get("queue", []) if q.get("id") != oid]
    entry["queue"].append({**offer, "id": oid})
    if len(entry["queue"]) > MAX_PENDING:
        entry["queue"] = entry["queue"][-MAX_PENDING:]


def _mk(on_yes: dict, prompt: str) -> dict:
    return {"on_yes": dict(on_yes), "prompt": str(prompt or ""), "t": time.time(),
            "id": _sig(on_yes)}


def remember(state, user_id: str, on_yes: Optional[dict], prompt: str = "") -> None:
    """Make ``on_yes`` the ACTIVE offer. Any different, still-unanswered active offer is kept
    as a reminder first, so offers are never silently lost."""
    if not (isinstance(on_yes, dict) and on_yes.get("intent")):
        return
    entry = _entry(state, user_id)
    _prune(entry)
    new = _mk(on_yes, prompt)
    act = entry.get("active")
    if act:
        if act.get("id") == new["id"]:
            act["t"] = new["t"]  # same offer re-made → just refresh its timeout
            # drop any stale copy of it from the queue
            entry["queue"] = [q for q in entry["queue"] if q.get("id") != new["id"]]
            return
        _push_queue(entry, act)  # a different question was live → remember it
    # a fresh active supersedes any queued copy of itself
    entry["queue"] = [q for q in entry["queue"] if q.get("id") != new["id"]]
    entry["active"] = new


def recall(state, user_id: str) -> Optional[dict]:
    """The ACTIVE offer's action if present and unexpired, usable as ``context.pending``."""
    entry = _entry(state, user_id)
    _prune(entry)
    act = entry.get("active")
    return dict(act["on_yes"]) if act and isinstance(act.get("on_yes"), dict) else None


def _resolve_active(entry: dict) -> None:
    entry["active"] = None


def _supersede_active(entry: dict) -> None:
    act = entry.get("active")
    if act:
        _push_queue(entry, act)
    entry["active"] = None


def record(state, user_id: str, res: Any, recalled: Optional[dict]) -> None:
    """Bookkeeping after interpreting an utterance:
      * a NEW offer in the result becomes active (old active → reminder queue);
      * if the result ANSWERED the active offer (ran its action, or declined) → consume it;
      * if the user did something ELSE while an offer was live → keep it as a reminder.
    """
    entry = _entry(state, user_id)
    _prune(entry)
    offer = getattr(res, "offer", None) or {}
    on_yes = offer.get("on_yes") if isinstance(offer, dict) else None
    if isinstance(on_yes, dict) and on_yes.get("intent"):
        remember(state, user_id, on_yes, offer.get("prompt", ""))
        return
    intent = getattr(res, "intent", "")
    slots = getattr(res, "slots", {}) or {}
    answered = bool(recalled) and intent == recalled.get("intent") and slots == (recalled.get("slots") or {})
    if answered or intent == "decline":
        _resolve_active(entry)
    elif recalled:  # a different command while an offer was live → keep it as a reminder
        _supersede_active(entry)


def list_pending(state, user_id: str) -> list[dict]:
    """The pending offers to remind the user about — the current one first, then older ones,
    newest-first. Each: {id, prompt, intent, slots, age_seconds, current}."""
    entry = _entry(state, user_id)
    _prune(entry)
    now = time.time()
    out: list[dict] = []

    def _row(o: dict, current: bool) -> dict:
        oy = o.get("on_yes") or {}
        return {"id": o.get("id") or _sig(oy), "prompt": o.get("prompt", ""),
                "intent": oy.get("intent", ""), "slots": oy.get("slots", {}),
                "age_seconds": int(now - float(o.get("t", now))), "current": current}

    if entry.get("active"):
        out.append(_row(entry["active"], True))
    for q in reversed(entry.get("queue", [])):
        out.append(_row(q, False))
    return out


def dismiss(state, user_id: str, offer_id: str = "", *, all: bool = False) -> int:
    """Remove a remembered offer by id (or all of them). Returns how many were removed."""
    entry = _entry(state, user_id)
    _prune(entry)
    if all:
        n = (1 if entry.get("active") else 0) + len(entry.get("queue", []))
        entry["active"] = None
        entry["queue"] = []
        return n
    removed = 0
    if entry.get("active") and entry["active"].get("id") == offer_id:
        entry["active"] = None
        removed += 1
    before = len(entry.get("queue", []))
    entry["queue"] = [q for q in entry.get("queue", []) if q.get("id") != offer_id]
    return removed + (before - len(entry["queue"]))


def clear_offer(state, user_id: str) -> None:
    """Drop the active offer only (answered/handled)."""
    entry = _entry(state, user_id)
    _resolve_active(entry)
