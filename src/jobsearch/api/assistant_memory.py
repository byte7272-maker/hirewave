"""Server-side memory of the assistant's pending yes/no OFFERS, per user.

The interpreter is stateless, so a bare "yes" (especially from the badge, which sends no
page context) can't know which question is live. This store fixes that and adds the behavior
the badge needs for SPOKEN interaction:

* **One ACTIVE offer at a time** — the single question a bare "yes"/"no" answers.
* **A bounded cache of older, unanswered offers** — not lost when a new offer is made or the
  user does something else; remembered (up to a small cap) for a clean reminder + dismissal.
* **Timeouts** so offers don't accumulate.

It is **persisted in the user's profile** (``view_state``), so it survives across web
replicas/restarts — a bare "yes" works even when the Matches fetch and the "yes" land on
different instances. An in-process fallback is used only when no profile store is available
(e.g. unit tests with a bare state). Works for EVERY area, not just matches.
"""

from __future__ import annotations

import time
from typing import Any, Optional

ACTIVE_TTL_SECONDS = 600       # how long a bare "yes"/"no" can still answer the active offer
QUEUE_TTL_SECONDS = 1800       # how long an unanswered offer is remembered as a reminder
MAX_PENDING = 5                # conservative cap on remembered reminders
_VS_KEY = "_assistant_offers"  # where it lives inside profile.view_state


def _sig(on_yes: dict) -> str:
    intent = str((on_yes or {}).get("intent") or "")
    slots = (on_yes or {}).get("slots") or {}
    body = ",".join(f"{k}={slots[k]}" for k in sorted(slots))
    return f"{intent}:{body}"


# --- storage: profile-backed (durable, cross-replica) with an in-process fallback ----------
def _inproc(state) -> dict:
    store = getattr(state, "_assistant_offers_mem", None)
    if store is None:
        store = {}
        try:
            setattr(state, "_assistant_offers_mem", store)
        except Exception:  # noqa: BLE001
            return {}
    return store


def _read(state, user_id: str):
    """Return (data, handle). ``handle`` is passed back to ``_write`` to persist. Prefers the
    user's profile so the memory is shared across instances; falls back to in-process."""
    profiles = getattr(state, "profiles", None)
    if profiles is not None:
        try:
            prof = profiles.get(user_id)
        except Exception:  # noqa: BLE001
            prof = None
        if prof is not None:
            raw = (getattr(prof, "view_state", None) or {}).get(_VS_KEY) or {}
            data = {"active": raw.get("active"), "queue": list(raw.get("queue") or [])}
            return data, ("profile", prof)
    data = _inproc(state).setdefault(user_id, {"active": None, "queue": []})
    return data, ("mem", user_id)


def _write(state, handle, data) -> None:
    kind, ref = handle
    if kind == "profile":
        try:
            vs = dict(getattr(ref, "view_state", None) or {})
            vs[_VS_KEY] = data
            ref.view_state = vs
            state.profiles.add(ref)
        except Exception:  # noqa: BLE001 — persistence is best-effort; never fail a request
            pass
    else:
        _inproc(state)[ref] = data


def _prune(data: dict) -> bool:
    """Drop expired offers. Returns True if anything changed (so the caller persists)."""
    now = time.time()
    changed = False
    act = data.get("active")
    if act and now - float(act.get("t", 0)) > ACTIVE_TTL_SECONDS:
        if now - float(act.get("t", 0)) <= QUEUE_TTL_SECONDS:
            _push_queue(data, act)
        data["active"] = None
        changed = True
    q = [x for x in data.get("queue", []) if now - float(x.get("t", 0)) <= QUEUE_TTL_SECONDS]
    if len(q) != len(data.get("queue", [])):
        data["queue"] = q
        changed = True
    return changed


def _push_queue(data: dict, offer: dict) -> None:
    oid = offer.get("id") or _sig(offer.get("on_yes") or {})
    data["queue"] = [q for q in data.get("queue", []) if q.get("id") != oid]
    data["queue"].append({**offer, "id": oid})
    if len(data["queue"]) > MAX_PENDING:
        data["queue"] = data["queue"][-MAX_PENDING:]


def _mk(on_yes: dict, prompt: str) -> dict:
    return {"on_yes": dict(on_yes), "prompt": str(prompt or ""), "t": time.time(),
            "id": _sig(on_yes)}


def remember(state, user_id: str, on_yes: Optional[dict], prompt: str = "") -> None:
    """Make ``on_yes`` the ACTIVE offer; a different still-unanswered one is kept as a reminder."""
    if not (isinstance(on_yes, dict) and on_yes.get("intent")):
        return
    data, handle = _read(state, user_id)
    _prune(data)
    new = _mk(on_yes, prompt)
    act = data.get("active")
    if act and act.get("id") == new["id"]:
        act["t"] = new["t"]
        data["queue"] = [q for q in data["queue"] if q.get("id") != new["id"]]
        _write(state, handle, data)
        return
    if act:
        _push_queue(data, act)
    data["queue"] = [q for q in data["queue"] if q.get("id") != new["id"]]
    data["active"] = new
    _write(state, handle, data)


def recall(state, user_id: str) -> Optional[dict]:
    """The ACTIVE offer's action if present and unexpired, usable as ``context.pending``."""
    data, handle = _read(state, user_id)
    if _prune(data):
        _write(state, handle, data)
    act = data.get("active")
    return dict(act["on_yes"]) if act and isinstance(act.get("on_yes"), dict) else None


def record(state, user_id: str, res: Any, recalled: Optional[dict]) -> None:
    """After interpreting: a new offer becomes active (old → reminder); an answered offer is
    consumed; a different command while an offer was live keeps it as a reminder."""
    offer = getattr(res, "offer", None) or {}
    on_yes = offer.get("on_yes") if isinstance(offer, dict) else None
    if isinstance(on_yes, dict) and on_yes.get("intent"):
        remember(state, user_id, on_yes, offer.get("prompt", ""))
        return
    data, handle = _read(state, user_id)
    _prune(data)
    intent = getattr(res, "intent", "")
    slots = getattr(res, "slots", {}) or {}
    answered = bool(recalled) and intent == recalled.get("intent") and slots == (recalled.get("slots") or {})
    if answered or intent == "decline":
        data["active"] = None
        _write(state, handle, data)
    elif recalled:
        act = data.get("active")
        if act:
            _push_queue(data, act)
        data["active"] = None
        _write(state, handle, data)


def list_pending(state, user_id: str) -> list[dict]:
    """Pending offers to remind about — the current one first (``current:true``), then older
    ones newest-first. Each: {id, prompt, intent, slots, age_seconds, current}."""
    data, handle = _read(state, user_id)
    if _prune(data):
        _write(state, handle, data)
    now = time.time()

    def _row(o: dict, current: bool) -> dict:
        oy = o.get("on_yes") or {}
        return {"id": o.get("id") or _sig(oy), "prompt": o.get("prompt", ""),
                "intent": oy.get("intent", ""), "slots": oy.get("slots", {}),
                "age_seconds": int(now - float(o.get("t", now))), "current": current}

    out: list[dict] = []
    if data.get("active"):
        out.append(_row(data["active"], True))
    for q in reversed(data.get("queue", [])):
        out.append(_row(q, False))
    return out


def dismiss(state, user_id: str, offer_id: str = "", *, all: bool = False) -> int:
    """Remove a remembered offer by id (or all). Returns how many were removed."""
    data, handle = _read(state, user_id)
    _prune(data)
    if all:
        n = (1 if data.get("active") else 0) + len(data.get("queue", []))
        data["active"] = None
        data["queue"] = []
        _write(state, handle, data)
        return n
    removed = 0
    if data.get("active") and data["active"].get("id") == offer_id:
        data["active"] = None
        removed += 1
    before = len(data.get("queue", []))
    data["queue"] = [q for q in data.get("queue", []) if q.get("id") != offer_id]
    removed += before - len(data["queue"])
    if removed:
        _write(state, handle, data)
    return removed


def clear_offer(state, user_id: str) -> None:
    data, handle = _read(state, user_id)
    data["active"] = None
    _write(state, handle, data)
