"""Server-side memory of the LAST yes/no offer the assistant made, per user.

The interpreter is stateless, so a bare "yes" (especially from the badge, which sends no
page context) can't know which question is live. This tiny, in-process, short-lived store
lets the backend REMEMBER the offer it just made — recorded when the assistant asks (an
interpret/observe response with an ``on_yes``, or landing on a page whose primary action is
obvious, like loading Matches) and recalled to resolve a bare "yes". It is a hint, not
durable state: it expires, lives only in this process, and is cleared once answered.
"""

from __future__ import annotations

import time
from typing import Any, Optional

#: How long a remembered offer stays answerable.
OFFER_TTL_SECONDS = 600


def _store(state) -> dict:
    store = getattr(state, "_assistant_last_offer", None)
    if store is None:
        store = {}
        try:
            setattr(state, "_assistant_last_offer", store)
        except Exception:  # noqa: BLE001 — state may forbid new attrs; memory just won't persist
            return {}
    return store


def remember_offer(state, user_id: str, on_yes: Optional[dict]) -> None:
    """Record the ACTION a 'yes' should run (an offer's ``on_yes`` = {intent, slots})."""
    if isinstance(on_yes, dict) and on_yes.get("intent"):
        _store(state)[user_id] = {"on_yes": dict(on_yes), "t": time.time()}


def recall_offer(state, user_id: str) -> Optional[dict]:
    """The remembered offer's action if present and unexpired, usable as ``context.pending``."""
    rec = _store(state).get(user_id)
    if not rec:
        return None
    if time.time() - float(rec.get("t", 0)) > OFFER_TTL_SECONDS:
        _store(state).pop(user_id, None)
        return None
    on_yes = rec.get("on_yes")
    return dict(on_yes) if isinstance(on_yes, dict) and on_yes.get("intent") else None


def clear_offer(state, user_id: str) -> None:
    _store(state).pop(user_id, None)


def update_from_result(state, user_id: str, res: Any) -> None:
    """After interpreting: remember a NEW offer the assistant just made, or clear the memory
    once the prior offer was answered (yes/no) or superseded by another command."""
    offer = getattr(res, "offer", None) or {}
    on_yes = offer.get("on_yes") if isinstance(offer, dict) else None
    if isinstance(on_yes, dict) and on_yes.get("intent"):
        remember_offer(state, user_id, on_yes)
    else:
        clear_offer(state, user_id)
