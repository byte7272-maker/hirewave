"""Lightweight, persistent AI-usage metering for the admin cost dashboard.

The real LLM client (``LLMProvider.complete``) returns only a string — no token
counts — so we **estimate** tokens from text length (~4 chars/token) and record a
small per-user, per-month tally in the document store (a durable key/value store
backed by the same DB). This is a planning/estimate layer, not exact billing.

Design:
- :func:`meter_llm` wraps a provider so every ``complete()`` records one usage event
  attributed to the *current actor* (the authenticated user, set per request via
  :func:`set_actor`). Calls with no actor (the background worker) bucket under
  ``"system"``.
- Only ``complete()`` is metered — it is driven by explicit user actions (résumé/cover
  AI edits, generation, interview answers) and is low-volume. Embeddings (high-volume,
  cached, cheap) are intentionally not metered here.
- Usage is bucketed by calendar month (UTC): one small JSON doc per user per month, so
  reads/writes stay O(1) and the dashboard can show month-to-date cost.
"""

from __future__ import annotations

import contextvars
import json
from typing import Optional

from jobsearch.models.common import utcnow

# The user whose request is currently running, for attributing AI calls. Set by the
# auth dependency; unset (None) for background/scheduler work.
_actor: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("ai_usage_actor", default=None)

SYSTEM_ACTOR = "system"


def set_actor(user_id: Optional[str]) -> contextvars.Token:
    """Mark the current actor (authenticated user id). Returns a reset token."""
    return _actor.set(user_id or None)


def reset_actor(token: contextvars.Token) -> None:
    try:
        _actor.reset(token)
    except (ValueError, LookupError):  # token from another context — ignore
        pass


def current_actor() -> str:
    return _actor.get() or SYSTEM_ACTOR


# --- token estimate --------------------------------------------------------
def est_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token, floor of 1 for non-empty."""
    if not text:
        return 0
    return max(1, len(text) // 4)


# --- storage ---------------------------------------------------------------
def month_key(now=None) -> str:
    now = now or utcnow()
    return f"{now.year:04d}-{now.month:02d}"


def _doc_key(month: str, actor: str) -> str:
    return f"aiusage:{month}:{actor}"


def _blank() -> dict:
    return {"ops": 0, "in_tokens": 0, "out_tokens": 0, "by_model": {}}


def _load(store, key: str) -> dict:
    try:
        got = store.get(key)
    except Exception:  # noqa: BLE001 - no/broken store -> empty
        return _blank()
    if not got:
        return _blank()
    try:
        data = json.loads(got[0].decode("utf-8", "ignore"))
    except Exception:  # noqa: BLE001 - corrupt
        return _blank()
    base = _blank()
    base.update({k: data.get(k, base[k]) for k in base})
    if not isinstance(base.get("by_model"), dict):
        base["by_model"] = {}
    return base


def record(
    store,
    *,
    actor: Optional[str],
    in_tokens: int,
    out_tokens: int,
    model: str = "",
    now=None,
) -> None:
    """Add one AI completion to the actor's month bucket. Best-effort; never raises."""
    if store is None:
        return
    who = actor or SYSTEM_ACTOR
    key = _doc_key(month_key(now), who)
    try:
        agg = _load(store, key)
        agg["ops"] += 1
        agg["in_tokens"] += max(0, int(in_tokens))
        agg["out_tokens"] += max(0, int(out_tokens))
        m = (model or "unknown").lower()
        slot = agg["by_model"].setdefault(m, {"ops": 0, "in_tokens": 0, "out_tokens": 0})
        slot["ops"] += 1
        slot["in_tokens"] += max(0, int(in_tokens))
        slot["out_tokens"] += max(0, int(out_tokens))
        store.put(key, json.dumps(agg).encode("utf-8"), content_type="application/json")
    except Exception:  # noqa: BLE001 - metering must never break a user action
        pass


def usage_for(store, actor: str, month: Optional[str] = None) -> dict:
    """The usage tally for one actor in a month (defaults to the current month)."""
    return _load(store, _doc_key(month or month_key(), actor or SYSTEM_ACTOR))


def estimate_cost(usage: dict, *, in_per_1k: float, out_per_1k: float) -> float:
    """Estimated USD cost of a usage tally at the given per-1K-token rates."""
    it = usage.get("in_tokens", 0) or 0
    ot = usage.get("out_tokens", 0) or 0
    return round((it / 1000.0) * in_per_1k + (ot / 1000.0) * out_per_1k, 4)


# --- metering wrapper ------------------------------------------------------
class MeteringLLMProvider:
    """Wraps an ``LLMProvider`` and records estimated usage per ``complete()`` call,
    attributed to the current actor. Delegates everything else to the inner provider."""

    def __init__(self, inner, recorder):
        # recorder(actor, in_tokens, out_tokens, model) -> None
        self._inner = inner
        self._recorder = recorder

    @property
    def name(self) -> str:
        return getattr(self._inner, "name", "unknown")

    def complete(self, prompt: str, *, system=None, temperature: float = 0.4, max_tokens: int = 1500) -> str:
        result = self._inner.complete(
            prompt, system=system, temperature=temperature, max_tokens=max_tokens
        )
        try:
            in_tok = est_tokens(prompt) + est_tokens(system or "")
            out_tok = est_tokens(result or "")
            model = getattr(self._inner, "model", "") or getattr(self._inner, "name", "")
            self._recorder(current_actor(), in_tok, out_tok, str(model))
        except Exception:  # noqa: BLE001 - never let metering break generation
            pass
        return result

    def __getattr__(self, item):  # delegate any other attribute/method
        return getattr(self._inner, item)


def meter_llm(inner, recorder):
    """Return *inner* wrapped so each completion is metered. ``None`` passes through."""
    if inner is None:
        return None
    return MeteringLLMProvider(inner, recorder)
