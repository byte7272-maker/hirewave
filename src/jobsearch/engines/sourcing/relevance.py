"""Job relevance to a user's stated (or inferred) preferences.

Matching ranks by profile similarity, but without a hard gate off-target postings (e.g.
non-IT roles for an IT candidate) still surface. This module scores a posting's relevance
to the user's ``JobPreferences`` (target roles + categories) and filters the pool, and it
infers preferences from the postings the user actually reaped from their email alerts and
direct sources — so relevance is self-populating.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

_STOP = {
    "the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "at", "with", "ii", "iii",
    "sr", "jr", "senior", "junior", "lead", "staff", "principal", "entry", "level", "i",
    "remote", "hybrid", "contract", "fulltime", "part", "time", "full",
}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9+#]+", (s or "").lower())
            if len(w) > 1 and w not in _STOP}


def preference_terms(prefs) -> set[str]:
    """Significant tokens from the user's target roles + job categories (empty => no
    preference set, so nothing is filtered)."""
    terms: set[str] = set()
    for r in getattr(prefs, "target_roles", None) or []:
        terms |= _tokens(r)
    for c in getattr(prefs, "job_categories", None) or []:
        terms |= _tokens(c)
    return terms


def _job_text(job) -> set[str]:
    return _tokens((getattr(job, "title", "") or "") + " " + (getattr(job, "category", "") or ""))


def relevance_score(job, prefs) -> float:
    """0..1 — the fraction of the user's preference terms the job's title/category hits.
    Returns 1.0 when no preferences are set (don't penalize an unconfigured user)."""
    terms = preference_terms(prefs)
    if not terms:
        return 1.0
    jt = _job_text(job)
    if not jt:
        return 0.0
    return len(terms & jt) / len(terms)


def is_relevant(job, prefs) -> bool:
    """True when the job shares at least one meaningful term with the user's preferences,
    or no preferences are set."""
    terms = preference_terms(prefs)
    if not terms:
        return True
    return bool(terms & _job_text(job))


def filter_relevant(jobs: Iterable, prefs) -> list:
    """Keep only jobs relevant to the preferences — but never return an empty list when
    there were jobs: if the gate removes everything (prefs too narrow / mislabeled pool),
    fall back to the full list so the user still sees matches."""
    jobs = list(jobs)
    if not preference_terms(prefs):
        return jobs
    kept = [j for j in jobs if is_relevant(j, prefs)]
    return kept if kept else jobs


def infer_preferences(jobs: Iterable, *, top: int = 5) -> dict:
    """Infer likely preferences from the postings the user actually reaped (their email
    alerts + direct sources): the most common categories, title phrases, and keywords.
    Seeded sample postings are ignored."""
    cats: Counter = Counter()
    toks: Counter = Counter()
    titles: Counter = Counter()
    for j in jobs:
        if getattr(j, "is_sample", False):
            continue
        c = (getattr(j, "category", "") or "").strip()
        if c:
            cats[c] += 1
        for w in _tokens(getattr(j, "title", "") or ""):
            toks[w] += 1
        t = (getattr(j, "title", "") or "").strip()
        if t:
            titles[t] += 1
    return {
        "job_categories": [c for c, _ in cats.most_common(top)],
        "target_roles": [t for t, _ in titles.most_common(top)],
        "keywords": [w for w, _ in toks.most_common(top * 2)],
    }
