"""Assistant learning telemetry — what users ask, what the assistant can't do, and
which features it drives (for the admin digest; see READDY_PROMPTS P182).

A per-browser store (the frontend's localStorage) can't tell an operator the *most
common* question or failure across everyone, so we aggregate here. Each assistant
interaction emits one small event; we fold it into a per-user, per-month JSON doc in the
document store (same O(1) read/write pattern as :mod:`ai_usage` and
:mod:`feature_activity`). The admin dashboard merges across users at read time.

Privacy: this is *product telemetry, not content capture*. We keep a short, normalized
utterance for clustering, **PII-stripped** (emails, phone numbers, long digit runs →
placeholders) and length-capped. We never store résumé/cover-letter text. Dictionaries
are capped so a doc can't grow without bound; the lowest-count entry is evicted on
overflow.
"""

from __future__ import annotations

import json
import re
from typing import Iterable, Optional

from jobsearch.models.common import utcnow

# --- vocabulary -------------------------------------------------------------
STATUSES = ("resolved", "clarified", "failed")
PATHS = ("chip", "typed", "voice")
FAILURE_CLASSES = (
    "not_understood",       # couldn't classify the request
    "understood_no_action", # understood but did nothing / wrong place
    "action_errored",       # tried and the action threw
    "missing_capability",   # a real ask we don't support yet
)
# Assistant-driven features (complements feature_activity's app-wide hit counter).
FEATURES = (
    "design", "versions", "bullets", "tailor", "ask_ai", "highlights",
    "matches", "doc_switch", "archive_delete", "review_brief", "walkthrough",
)

# --- caps (keep each per-user monthly doc small) ----------------------------
_MAX_QUESTIONS = 200       # distinct normalized utterances tracked per user/month
_MAX_EXAMPLES_PER_CLASS = 25
_UTTERANCE_MAXLEN = 80

# --- PII scrubbing ----------------------------------------------------------
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_PHONE = re.compile(r"\b(?:\+?\d[\d\-.\s()]{7,}\d)\b")
_LONGNUM = re.compile(r"\b\d{5,}\b")
_WS = re.compile(r"\s+")


def normalize_utterance(text: str) -> str:
    """Lowercase, scrub obvious PII, collapse whitespace, truncate. For clustering only."""
    s = (text or "").strip()
    if not s:
        return ""
    s = _EMAIL.sub("<email>", s)
    s = _PHONE.sub("<number>", s)
    s = _LONGNUM.sub("<number>", s)
    s = _WS.sub(" ", s).strip().lower()
    return s[:_UTTERANCE_MAXLEN]


def _coerce(value: str, allowed: tuple, default: str = "") -> str:
    v = (value or "").strip().lower()
    return v if v in allowed else default


# --- storage ----------------------------------------------------------------
def month_key(now=None) -> str:
    now = now or utcnow()
    return f"{now.year:04d}-{now.month:02d}"


def recent_months(n: int, now=None) -> list[str]:
    """The last ``n`` month keys, newest first (e.g. ['2026-11', '2026-10'])."""
    now = now or utcnow()
    y, m = now.year, now.month
    out: list[str] = []
    for _ in range(max(1, n)):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return out


def _doc_key(month: str, user_id: str) -> str:
    return f"asst_tel:{month}:{user_id}"


def _blank() -> dict:
    return {
        "events": 0,
        "status": {s: 0 for s in STATUSES},
        "paths": {p: 0 for p in PATHS},
        "questions": {},   # normalized utterance -> count
        "failures": {},    # class -> {"count": int, "examples": {utterance: count}}
        "features": {},    # feature -> {"completed": int, "abandoned": int, "total": int}
    }


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
    if isinstance(data, dict):
        base["events"] = int(data.get("events", 0) or 0)
        for bucket, keys in (("status", STATUSES), ("paths", PATHS)):
            src = data.get(bucket, {}) or {}
            if isinstance(src, dict):
                for k in keys:
                    base[bucket][k] = int(src.get(k, 0) or 0)
        if isinstance(data.get("questions"), dict):
            base["questions"] = {str(k): int(v or 0) for k, v in data["questions"].items()}
        if isinstance(data.get("failures"), dict):
            for cls, slot in data["failures"].items():
                if cls in FAILURE_CLASSES and isinstance(slot, dict):
                    ex = slot.get("examples", {})
                    base["failures"][cls] = {
                        "count": int(slot.get("count", 0) or 0),
                        "examples": {str(k): int(v or 0) for k, v in ex.items()} if isinstance(ex, dict) else {},
                    }
        if isinstance(data.get("features"), dict):
            for feat, slot in data["features"].items():
                if feat in FEATURES and isinstance(slot, dict):
                    base["features"][feat] = {
                        "completed": int(slot.get("completed", 0) or 0),
                        "abandoned": int(slot.get("abandoned", 0) or 0),
                        "total": int(slot.get("total", 0) or 0),
                    }
    return base


def _bump_capped(d: dict, key: str, inc: int, cap: int) -> None:
    """Add ``inc`` to ``d[key]``; when inserting a new key over ``cap``, evict the
    smallest existing entry so the dict stays bounded."""
    if key in d:
        d[key] += inc
        return
    if len(d) >= cap:
        # evict the least-frequent entry (keep the signal that matters to the admin)
        smallest = min(d, key=lambda k: d[k])
        if d[smallest] <= inc:
            del d[smallest]
        else:
            return  # incoming is rarer than everything tracked; skip it
    d[key] = inc


def _apply(agg: dict, event: dict) -> None:
    """Fold a single event into the aggregate doc (in place)."""
    agg["events"] += 1
    status = _coerce(event.get("status", ""), STATUSES)
    if status:
        agg["status"][status] += 1
    path = _coerce(event.get("path", ""), PATHS)
    if path:
        agg["paths"][path] += 1

    norm = normalize_utterance(event.get("utterance", ""))
    if norm:
        _bump_capped(agg["questions"], norm, 1, _MAX_QUESTIONS)

    if status == "failed":
        cls = _coerce(event.get("failure_class", ""), FAILURE_CLASSES, "not_understood")
        slot = agg["failures"].setdefault(cls, {"count": 0, "examples": {}})
        slot["count"] += 1
        if norm:
            _bump_capped(slot["examples"], norm, 1, _MAX_EXAMPLES_PER_CLASS)

    feat = _coerce(event.get("feature", ""), FEATURES)
    if feat:
        outcome = _coerce(event.get("outcome", ""), ("completed", "abandoned"))
        slot = agg["features"].setdefault(feat, {"completed": 0, "abandoned": 0, "total": 0})
        slot["total"] += 1
        if outcome:
            slot[outcome] += 1


def record(store, user_id: str, events: Iterable[dict], now=None) -> int:
    """Fold a batch of events into the user's month bucket. Best-effort; never raises.

    Returns the number of events accepted (0 if the store is unavailable)."""
    if store is None or not user_id:
        return 0
    batch = [e for e in (events or []) if isinstance(e, dict)]
    if not batch:
        return 0
    key = _doc_key(month_key(now), user_id)
    try:
        agg = _load(store, key)
        for e in batch:
            _apply(agg, e)
        store.put(key, json.dumps(agg).encode("utf-8"), content_type="application/json")
        return len(batch)
    except Exception:  # noqa: BLE001 - telemetry must never break a user action
        return 0


# --- read side (admin digest) ----------------------------------------------
def _merge_into(total: dict, doc: dict) -> None:
    total["events"] += doc.get("events", 0)
    for bucket, keys in (("status", STATUSES), ("paths", PATHS)):
        for k in keys:
            total[bucket][k] += doc[bucket].get(k, 0)
    for q, c in doc.get("questions", {}).items():
        total["questions"][q] = total["questions"].get(q, 0) + c
    for cls, slot in doc.get("failures", {}).items():
        dst = total["failures"].setdefault(cls, {"count": 0, "examples": {}})
        dst["count"] += slot.get("count", 0)
        for ex, c in slot.get("examples", {}).items():
            dst["examples"][ex] = dst["examples"].get(ex, 0) + c
    for feat, slot in doc.get("features", {}).items():
        dst = total["features"].setdefault(feat, {"completed": 0, "abandoned": 0, "total": 0})
        dst["completed"] += slot.get("completed", 0)
        dst["abandoned"] += slot.get("abandoned", 0)
        dst["total"] += slot.get("total", 0)


def insights(
    store,
    user_ids: Iterable[str],
    *,
    months: int = 1,
    top: int = 20,
    now=None,
) -> dict:
    """Merge telemetry across the given users over the last ``months`` months into an
    admin digest: top questions, top failures (with example phrasings + class), feature
    usage (completion/abandonment), status/path totals, and a per-month trend."""
    month_list = recent_months(months, now)
    total = _blank()
    trend_by_month: dict[str, dict] = {m: {"events": 0, "failed": 0} for m in month_list}

    for uid in user_ids:
        if not uid:
            continue
        for m in month_list:
            doc = _load(store, _doc_key(m, uid))
            if doc.get("events", 0) == 0:
                continue
            _merge_into(total, doc)
            trend_by_month[m]["events"] += doc.get("events", 0)
            trend_by_month[m]["failed"] += doc["status"].get("failed", 0)

    top_questions = [
        {"text": t, "count": c}
        for t, c in sorted(total["questions"].items(), key=lambda kv: (-kv[1], kv[0]))[:top]
    ]
    top_failures = []
    for cls, slot in sorted(total["failures"].items(), key=lambda kv: -kv[1]["count"]):
        examples = [
            {"text": t, "count": c}
            for t, c in sorted(slot["examples"].items(), key=lambda kv: (-kv[1], kv[0]))[:5]
        ]
        top_failures.append({"class": cls, "count": slot["count"], "examples": examples})

    feature_usage = []
    for feat, slot in sorted(total["features"].items(), key=lambda kv: -kv[1]["total"]):
        tot = slot["total"]
        feature_usage.append({
            "feature": feat,
            "completed": slot["completed"],
            "abandoned": slot["abandoned"],
            "total": tot,
            "completion_rate": round(slot["completed"] / tot, 3) if tot else 0.0,
        })

    return {
        "period": {"months": month_list, "from": month_list[-1], "to": month_list[0]},
        "totals": {
            "events": total["events"],
            "status": total["status"],
            "paths": total["paths"],
        },
        "top_questions": top_questions,
        "top_failures": top_failures,
        "feature_usage": feature_usage,
        "trend": [
            {"month": m, "events": trend_by_month[m]["events"], "failed": trend_by_month[m]["failed"]}
            for m in reversed(month_list)  # oldest -> newest for charting
        ],
    }
