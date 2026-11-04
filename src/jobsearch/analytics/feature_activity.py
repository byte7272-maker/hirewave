"""Per-user, per-feature interaction metering for the admin dashboard.

Answers "how much does each user actually use each core feature?" — not how many
artifacts they own, but how often they *act*. A single ASGI middleware records one hit
per **state-changing** request (POST/PUT/PATCH/DELETE) that succeeds (2xx), mapped from
the request path to a core-feature bucket. Read-only polling is ignored, so the counts
reflect real interactions.

Storage mirrors :mod:`ai_usage`: one small JSON doc per user per calendar month in the
document store, so reads/writes stay O(1).
"""

from __future__ import annotations

import json
from typing import Optional

from jobsearch.models.common import utcnow

#: The core features surfaced on the dashboard.
FEATURES = [
    "resumes",        # résumé editing, AI edits, highlights, versions, design
    "cover_letters",  # cover-letter editing/generation
    "job_search",     # matches, searches, sourcing, ingest
    "applications",   # auto-apply, apply wizard, pipeline
    "interview",      # practice + mock interviews
    "highlights",     # the experience library
    "integrations",   # connecting email / job sites
]

# Longest / most specific prefixes first; cover-letters before resumes, etc.
_PREFIX_MAP = [
    ("/api/v1/cover-letters", "cover_letters"),
    ("/api/v1/experience", "highlights"),
    ("/api/v1/resumes", "resumes"),
    ("/api/v1/job-search", "job_search"),
    ("/api/v1/jobs", "job_search"),
    ("/api/v1/matches", "job_search"),
    ("/api/v1/sourcing", "job_search"),
    ("/api/v1/saved-searches", "job_search"),
    ("/api/v1/auto-apply", "applications"),
    ("/api/v1/applications", "applications"),
    ("/api/v1/interview", "interview"),
    ("/api/v1/practice", "interview"),
    ("/api/v1/mock-interviews", "interview"),
    ("/api/v1/integrations", "integrations"),
    ("/api/v1/inbox", "integrations"),
]


def classify(path: str) -> str:
    """Map a request path to a core-feature bucket, or "" if it isn't a core feature."""
    p = (path or "").rstrip("/")
    for prefix, feat in _PREFIX_MAP:
        if p == prefix or p.startswith(prefix + "/"):
            return feat
    return ""


def month_key(now=None) -> str:
    now = now or utcnow()
    return f"{now.year:04d}-{now.month:02d}"


def _doc_key(month: str, user_id: str) -> str:
    return f"feat:{month}:{user_id}"


def _load(store, key: str) -> dict:
    try:
        got = store.get(key)
    except Exception:  # noqa: BLE001
        return {}
    if not got:
        return {}
    try:
        data = json.loads(got[0].decode("utf-8", "ignore"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def record(store, user_id: str, feature: str, now=None) -> None:
    """Add one interaction for (user, feature) in the current month. Best-effort."""
    if store is None or not user_id or feature not in FEATURES:
        return
    key = _doc_key(month_key(now), user_id)
    try:
        agg = _load(store, key)
        agg[feature] = int(agg.get(feature, 0)) + 1
        store.put(key, json.dumps(agg).encode("utf-8"), content_type="application/json")
    except Exception:  # noqa: BLE001 - metering must never break a request
        pass


def activity_for(store, user_id: str, month: Optional[str] = None) -> dict:
    """The feature-interaction tally for one user in a month (zero-filled for all FEATURES)."""
    raw = _load(store, _doc_key(month or month_key(), user_id))
    out = {f: int(raw.get(f, 0)) for f in FEATURES}
    out["total"] = sum(out.values())
    return out
