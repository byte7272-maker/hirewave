"""Merge runtime knowledge overrides over the static catalogs.

Pure functions: given the stored :class:`KnowledgeEntry` list and a user id, produce
the per-key overrides for a category and merge them over a static dict. Keeps the
override logic in one place so every serving endpoint applies it the same way.
"""

from __future__ import annotations

from typing import Iterable


def overrides_for(entries: Iterable, category: str, user_id: str = "") -> dict:
    """The effective {key: data} overrides for a category: global entries first, then
    this user's entries on top (user wins); within a scope, the latest ``updated_at``
    wins. Inactive entries are ignored."""
    glob: dict[str, tuple] = {}
    usr: dict[str, tuple] = {}
    for e in entries:
        if not getattr(e, "active", True) or e.category != category or not e.key:
            continue
        at = getattr(e, "updated_at", None)
        bucket = usr if (user_id and e.scope == user_id) else (glob if e.scope == "global" else None)
        if bucket is None:
            continue
        prior = bucket.get(e.key)
        if prior is None or (at is not None and prior[0] is not None and at >= prior[0]) or prior[0] is None:
            bucket[e.key] = (at, e.data or {})
    out: dict[str, dict] = {k: v[1] for k, v in glob.items()}
    out.update({k: v[1] for k, v in usr.items()})  # user overrides win
    return out


def merge(static: dict, overrides: dict) -> dict:
    """Shallow-merge per-key overrides over a static {key: entry-dict} catalog.
    An override whose data is a dict is merged into the static entry (adds/replaces
    fields); a new key is added; ``{"_remove": true}`` drops the key."""
    if not overrides:
        return static
    merged = {k: (dict(v) if isinstance(v, dict) else v) for k, v in static.items()}
    for key, data in overrides.items():
        if isinstance(data, dict) and data.get("_remove"):
            merged.pop(key, None)
            continue
        if key in merged and isinstance(merged[key], dict) and isinstance(data, dict):
            merged[key] = {**merged[key], **data}
        else:
            merged[key] = data
    return merged
