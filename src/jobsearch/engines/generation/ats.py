"""ATS keyword analysis — extraction, coverage scoring, gap detection.

Applicant Tracking Systems rank resumes partly on keyword overlap with the job
description. These helpers extract the salient keywords from a posting and
measure how well a resume covers them, driving the "keyword injection" feature
and the resume's ``ats_score``.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

_WORD = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}")

# Small, dependency-free stopword list — enough to strip obvious noise.
_STOPWORDS = frozenset(
    """
    a an and are as at be by for from has have in is it its of on or that the to
    with we you your our their they will would can could should must may our us
    this these those job role work working experience years year team teams
    company companies including etc using use used ability able strong excellent
    good great across who what when where which while about into over under more
    most other others any all new via per plus etc also within without
    """.split()
)

# Multi-word technical phrases worth keeping intact.
_KNOWN_PHRASES = (
    "machine learning",
    "deep learning",
    "data science",
    "project management",
    "product management",
    "continuous integration",
    "public cloud",
    "unit testing",
    "natural language processing",
    "computer vision",
    "rest api",
    "ci/cd",
)


def _normalize(text: str) -> str:
    return text.lower()


def extract_keywords(text: str, *, top_n: int = 25) -> list[str]:
    """Return the most salient keywords/phrases in *text*, ranked by frequency.

    Multi-word technical phrases are detected first; remaining single tokens are
    filtered against a stopword list and short-length noise.
    """
    lowered = _normalize(text)
    phrases_found: list[str] = []
    working = lowered
    for phrase in _KNOWN_PHRASES:
        if phrase in working:
            phrases_found.append(phrase)
            working = working.replace(phrase, " ")

    tokens = [t for t in _WORD.findall(working) if t not in _STOPWORDS and len(t) > 2]
    counts = Counter(tokens)

    ranked = [w for w, _ in counts.most_common()]
    # Phrases first (high signal), then single-token keywords, de-duplicated.
    ordered: list[str] = []
    seen: set[str] = set()
    for kw in phrases_found + ranked:
        if kw not in seen:
            seen.add(kw)
            ordered.append(kw)
        if len(ordered) >= top_n:
            break
    return ordered


def _covered(keyword: str, haystack: str) -> bool:
    return keyword in haystack


def missing_keywords(resume_text: str, job_keywords: Iterable[str]) -> list[str]:
    """Keywords present in the job but absent from the resume text."""
    hay = _normalize(resume_text)
    return [kw for kw in job_keywords if not _covered(kw, hay)]


def ats_score(resume_text: str, job_keywords: list[str]) -> float:
    """Percentage (0-100) of job keywords covered by the resume text."""
    if not job_keywords:
        return 100.0
    hay = _normalize(resume_text)
    covered = sum(1 for kw in job_keywords if _covered(kw, hay))
    return round(100.0 * covered / len(job_keywords), 1)
