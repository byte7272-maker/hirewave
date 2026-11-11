"""Robust free-text job search over a user's posting pool.

Turns a natural phrase — "find all jobs that are vice president or VP", "remote senior
python roles", "director or VP of marketing" — into a ranked filter. It handles:

- **OR-alternatives**: ``A or B``, ``A, B``, ``A / B`` each match independently.
- **Synonym/abbreviation expansion**: VP == vice president, sr == senior, mgr == manager,
  swe == software engineer, … via *canonicalization* (both the query term and the job
  text are rewritten to a shared slug, so "VP" matches "Vice President, Sales").
- **Multi-field matching** across title, company, location and category, with field-
  weighted scoring so a title hit ranks above a description hit.

Pure functions over domain objects — no I/O — so it's cheap to unit-test and the API layer
just feeds it the user's postings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional

# --- synonym / abbreviation groups -----------------------------------------
# Each inner list is a set of phrases that mean the same thing. The first phrase's
# squashed form becomes the shared canonical slug for the whole group.
_SYNONYM_GROUPS: list[list[str]] = [
    ["vice president", "vp"],
    ["senior vice president", "svp"],
    ["executive vice president", "evp"],
    ["assistant vice president", "avp"],
    ["senior", "sr"],
    ["junior", "jr"],
    ["manager", "mgr"],
    ["management", "mgmt"],
    ["director", "dir"],
    ["engineer", "eng"],
    ["engineering", "engg"],
    ["developer", "dev"],
    ["operations", "ops"],
    ["administrator", "admin"],
    ["administrative", "admin assistant"],
    ["human resources", "hr"],
    ["product manager", "pm", "product mgr"],
    ["project manager", "proj manager", "proj mgr"],
    ["chief executive officer", "ceo"],
    ["chief technology officer", "cto"],
    ["chief financial officer", "cfo"],
    ["chief operating officer", "coo"],
    ["chief marketing officer", "cmo"],
    ["chief information officer", "cio"],
    ["software engineer", "swe"],
    ["software development engineer", "sde"],
    ["quality assurance", "qa"],
    ["user experience", "ux"],
    ["user interface", "ui"],
    ["machine learning", "ml"],
    ["artificial intelligence", "ai"],
    ["business analyst", "ba"],
    ["account executive", "ae"],
    ["representative", "rep"],
    ["executive", "exec"],
    ["associate", "assoc"],
    ["coordinator", "coord"],
    ["specialist", "spec"],
    ["accountant", "accounting"],
    ["information technology", "it"],
    ["remote", "work from home", "wfh", "telecommute"],
]


def _slug(phrase: str) -> str:
    return "§" + re.sub(r"\s+", "", phrase)  # § prefix keeps slugs from colliding with words


# phrase -> shared slug, ordered longest-first so multiword phrases win over their abbrevs
_CANON: list[tuple[str, str]] = []
for _group in _SYNONYM_GROUPS:
    _canon_slug = _slug(_group[0])
    for _p in _group:
        _CANON.append((_p, _canon_slug))
_CANON.sort(key=lambda kv: -len(kv[0]))

_WORD = re.compile(r"[^\w\s%+#.-]")
_SPLIT_ALTERNATIVES = re.compile(r"\bor\b|,|/|\bvs\.?\b|\|")
# Words that carry no search signal once the intent is known.
_STOP = {
    "find", "search", "show", "list", "get", "me", "all", "any", "my", "the", "a", "an",
    "some", "please", "for", "with", "that", "are", "is", "which", "and", "jobs", "job",
    "roles", "role", "positions", "position", "openings", "opening", "listings", "listing",
    "postings", "posting", "of", "in", "at", "to", "titled", "called", "matching", "like",
    "related", "about", "where", "want", "looking", "look", "them", "there",
}


def canonicalize(text: str) -> str:
    """Lowercase, strip punctuation, and rewrite known synonyms/abbreviations to a shared
    slug so equivalents compare equal (``vp`` and ``vice president`` → same slug)."""
    s = " " + _WORD.sub(" ", (text or "").lower()) + " "
    s = re.sub(r"\s+", " ", s)
    for phrase, slug in _CANON:
        s = re.sub(rf"(?<=\s){re.escape(phrase)}(?=\s)", slug, s)
    return s.strip()


def _canon_tokens(text: str) -> list[str]:
    return [tok for tok in canonicalize(text).split() if tok]


def parse_alternatives(query: str) -> list[str]:
    """Split a raw query into independent OR-alternatives, each stripped of stopwords.

    "jobs that are vice president or VP" -> ["vice president", "vp"] (then canonicalized
    by the caller). Empty/stopword-only alternatives are dropped."""
    raw = (query or "").lower()
    parts = _SPLIT_ALTERNATIVES.split(raw)
    out: list[str] = []
    for part in parts:
        cleaned = _WORD.sub(" ", part)
        tokens = [w for w in cleaned.split() if w and w not in _STOP]
        phrase = " ".join(tokens).strip()
        if phrase:
            out.append(phrase)
    # de-dupe, preserve order
    seen: set[str] = set()
    uniq = []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


# --- scoring ----------------------------------------------------------------
# field -> weight; a title hit matters far more than a description hit.
_FIELD_WEIGHTS = (("title", 5.0), ("category", 3.0), ("company", 2.0), ("location", 1.5), ("description", 1.0))


def _field_text(job, field: str) -> str:
    return str(getattr(job, field, "") or "")


@dataclass
class Scored:
    job: object
    score: float
    matched: list[str]  # which alternatives hit (human-readable)


def _alt_score(alt_canon: str, field_canon: str) -> float:
    """Score one alternative against one (already-canonicalized) field string."""
    if not alt_canon or not field_canon:
        return 0.0
    toks = alt_canon.split()
    if not toks:
        return 0.0
    # whole-phrase substring is the strongest signal
    if f" {alt_canon} " in f" {field_canon} " or alt_canon in field_canon:
        return 1.0
    # otherwise: fraction of the alternative's tokens present (all present => near-phrase)
    hits = sum(1 for tk in toks if re.search(rf"(?<!\w){re.escape(tk)}(?!\w)", field_canon))
    if hits == 0:
        return 0.0
    frac = hits / len(toks)
    return 0.9 * frac if hits == len(toks) else 0.5 * frac


def search(
    jobs: Iterable,
    query: str,
    *,
    remote: Optional[bool] = None,
    seniority: str = "",
    employment_type: str = "",
    min_salary: Optional[int] = None,
    limit: int = 50,
) -> list[Scored]:
    """Rank ``jobs`` against a free-text ``query`` with OR-alternatives + synonym
    expansion, after applying optional structured filters. Returns the matches sorted by
    relevance (best first). An empty/irrelevant query yields no matches."""
    alts = parse_alternatives(query)
    alt_canon = [canonicalize(a) for a in alts]
    alt_canon = [a for a in alt_canon if a]
    want_sen = (seniority or "").strip().lower()
    want_emp = (employment_type or "").strip().lower()

    scored: list[Scored] = []
    for job in jobs:
        # structured filters first (cheap, and they never widen the result)
        if remote is not None and bool(getattr(job, "remote", False)) != remote:
            continue
        if want_sen and (getattr(job, "seniority", "") or "").lower() != want_sen:
            continue
        if want_emp and (getattr(job, "employment_type", "") or "").lower() != want_emp:
            continue
        if min_salary is not None:
            sr = getattr(job, "salary_range", None)
            if sr is None or (getattr(sr, "maximum", None) or 0) < min_salary:
                continue

        if not alt_canon:
            continue  # a query is required to rank; filters alone don't define a search

        field_canon = {f: canonicalize(_field_text(job, f)) for f, _w in _FIELD_WEIGHTS}
        total = 0.0
        matched: list[str] = []
        for alt_raw, alt in zip(alts, alt_canon):
            best = 0.0
            for field, weight in _FIELD_WEIGHTS:
                best = max(best, weight * _alt_score(alt, field_canon[field]))
            if best > 0:
                total += best
                matched.append(alt_raw)
        if total > 0:
            # small tiebreak: a job's own fit score nudges ties
            total += min(float(getattr(job, "match_score", 0) or 0), 100.0) / 1000.0
            scored.append(Scored(job=job, score=round(total, 4), matched=matched))

    scored.sort(key=lambda s: -s.score)
    return scored[: max(1, limit)]
