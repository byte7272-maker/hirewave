"""Scoring primitives for job matching.

A composite ``match_score`` in ``[0, 100]`` blends five normalized components:

* **semantic**  — cosine similarity of job vs. profile embeddings
* **skills**    — overlap of profile skills with the posting's requirements
* **location**  — remote/location-preference fit
* **salary**    — overlap of the posting's pay band with the user's target
* **seniority** — match of stated seniority to the posting's implied level

Weights are per-user and adjustable by the feedback loop (section 6.3).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from jobsearch.models import JobPosting, UserProfile

_SENIORITY_RANK = {
    "intern": 0,
    "junior": 1,
    "associate": 1,
    "mid": 2,
    "intermediate": 2,
    "senior": 3,
    "lead": 4,
    "staff": 4,
    "principal": 5,
    "director": 6,
}

_SENIORITY_HINTS = {
    "intern": ["intern", "internship"],
    "junior": ["junior", "entry level", "entry-level", "graduate"],
    "mid": ["mid", "intermediate"],
    "senior": ["senior", "sr."],
    "lead": ["lead", "team lead"],
    "staff": ["staff"],
    "principal": ["principal"],
    "director": ["director", "head of", "vp", "vice president"],
}


@dataclass
class MatchWeights:
    semantic: float = 0.45
    skills: float = 0.30
    location: float = 0.10
    salary: float = 0.08
    seniority: float = 0.05
    recency: float = 0.02  # a light nudge toward fresher postings

    def normalized(self) -> "MatchWeights":
        total = (self.semantic + self.skills + self.location + self.salary
                 + self.seniority + self.recency)
        if total <= 0:
            return MatchWeights()
        return MatchWeights(
            semantic=self.semantic / total,
            skills=self.skills / total,
            location=self.location / total,
            salary=self.salary / total,
            seniority=self.seniority / total,
            recency=self.recency / total,
        )


@dataclass
class MatchBreakdown:
    semantic: float = 0.0
    skills: float = 0.0
    location: float = 0.0
    salary: float = 0.0
    seniority: float = 0.0
    recency: float = 0.5  # neutral when the posting age is unknown

    def composite(self, weights: MatchWeights) -> float:
        w = weights.normalized()
        raw = (
            self.semantic * w.semantic
            + self.skills * w.skills
            + self.location * w.location
            + self.salary * w.salary
            + self.seniority * w.seniority
            + self.recency * w.recency
        )
        return round(100.0 * max(0.0, min(1.0, raw)), 1)


@dataclass
class MatchReason:
    """One human-readable "why this matches" line, derived from the breakdown."""

    label: str              # short headline, e.g. "Strong skill match"
    detail: str = ""        # specifics, e.g. "You have Python, AWS, Kubernetes"
    sentiment: str = "positive"  # positive | neutral | caution


@dataclass
class MatchResult:
    job: JobPosting
    score: float  # 0-100
    breakdown: MatchBreakdown
    matching_skills: list[str] = field(default_factory=list)
    gap_skills: list[str] = field(default_factory=list)
    reasons: list[MatchReason] = field(default_factory=list)  # why it matched (ranked)


def explain_match(
    result: "MatchResult", profile: UserProfile, weights: "MatchWeights"
) -> list[MatchReason]:
    """Turn a scored match into a short, ranked list of plain-language reasons —
    "skill overlap, salary alignment, location and seniority" — so the user can see
    WHY a role is a good fit, not just a number. Deterministic (no LLM): every reason
    comes from a breakdown component, ranked by its weighted contribution to the score.
    Returns the strongest positives first, plus at most one caution."""
    job = result.job
    b = result.breakdown
    w = weights.normalized()
    prefs = profile.preferences
    pos: list[tuple[float, MatchReason]] = []
    cautions: list[MatchReason] = []

    # Skills — the most concrete signal.
    if result.matching_skills:
        names = ", ".join(result.matching_skills[:3])
        more = len(result.matching_skills) - 3
        detail = f"You have {names}" + (f" +{more} more" if more > 0 else "")
        label = "Strong skill match" if b.skills >= 0.6 else "Skill overlap"
        pos.append((b.skills * w.skills, MatchReason(label, detail, "positive")))
    if result.gap_skills and b.skills < 0.8:
        gaps = ", ".join(result.gap_skills[:3])
        cautions.append(MatchReason("A few gaps", f"Not shown on your résumé: {gaps}", "caution"))

    # Semantic — overall background fit.
    if b.semantic >= 0.72:
        pos.append((b.semantic * w.semantic,
                    MatchReason("Fits your background", "Closely matches your résumé and experience", "positive")))

    # Salary.
    if job.salary_range and (job.salary_range.minimum or job.salary_range.maximum):
        if b.salary >= 0.85:
            pos.append((b.salary * w.salary, MatchReason("Pay in your range", job.salary_display, "positive")))
        elif b.salary < 0.5:
            cautions.append(MatchReason("Pay below your target", job.salary_display, "caution"))

    # Location / remote.
    if job.remote and prefs.remote_ok:
        pos.append((b.location * w.location + 1e-3, MatchReason("Remote", "Matches your remote preference", "positive")))
    elif b.location >= 0.9 and job.location:
        pos.append((b.location * w.location, MatchReason("Location match", job.location, "positive")))
    elif b.location <= 0.3 and job.location:
        cautions.append(MatchReason("Location may not fit", job.location, "caution"))

    # Seniority.
    if prefs.seniority:
        if b.seniority >= 0.85:
            pos.append((b.seniority * w.seniority,
                        MatchReason("Right level", f"Matches your {prefs.seniority} target", "positive")))
        elif b.seniority <= 0.5:
            cautions.append(MatchReason("Different level", "Seniority differs from your target", "caution"))

    # Recency.
    if b.recency >= 0.8 and job.posted_ago:
        pos.append((b.recency * w.recency, MatchReason("Fresh posting", f"Posted {job.posted_ago}", "positive")))

    pos.sort(key=lambda t: t[0], reverse=True)
    reasons = [r for _, r in pos][:4]
    if cautions:
        reasons.append(cautions[0])  # at most one caution — keep the card digestible
    return reasons


# --- component scorers ------------------------------------------------------
_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#.\-]{1,}")


def _skill_tokens(skill: str) -> set[str]:
    return set(_TOKEN.findall(skill.lower()))


def skills_fit(profile: UserProfile, job: JobPosting) -> tuple[float, list[str], list[str]]:
    """Return (score 0-1, matching_skills, gap_skills) via requirement overlap."""
    reqs = [r.strip() for r in job.requirements if r.strip()]
    job_text = (job.description + " " + " ".join(reqs)).lower()
    profile_skills = profile.skills or []
    if not profile_skills:
        return 0.0, [], reqs

    matching = [s for s in profile_skills if s.lower() in job_text]

    # Gap: requirement phrases the profile does not evidence.
    profile_blob = " ".join(profile_skills).lower()
    gaps = [r for r in reqs if not any(tok in profile_blob for tok in _skill_tokens(r))]

    denom = max(len(reqs), 1) if reqs else len(profile_skills)
    covered = len(matching) if not reqs else len(reqs) - len(gaps)
    score = max(0.0, min(1.0, covered / denom))
    return score, matching, gaps


def location_fit(profile: UserProfile, job: JobPosting) -> float:
    prefs = profile.preferences
    if job.remote and prefs.remote_ok:
        return 1.0
    targets = [t.lower() for t in prefs.target_locations]
    if not targets:
        return 0.7 if not job.remote else 0.8  # neutral-ish when unspecified
    loc = job.location.lower()
    if any(t in loc or loc in t for t in targets):
        return 1.0
    return 0.2 if not job.remote else 0.6


def salary_fit(profile: UserProfile, job: JobPosting) -> float:
    want = profile.preferences.salary_range
    have = job.salary_range
    if not have or (have.minimum is None and have.maximum is None):
        return 0.6  # unknown — mildly neutral
    if want.minimum is None and want.maximum is None:
        return 0.7
    w_min = want.minimum or 0
    w_max = want.maximum or (want.minimum or 0) * 3 or 10**9
    h_min = have.minimum or have.maximum or 0
    h_max = have.maximum or have.minimum or 0
    # Overlap of [w_min,w_max] and [h_min,h_max].
    overlap = max(0, min(w_max, h_max) - max(w_min, h_min))
    span = max(1, w_max - w_min)
    if overlap > 0:
        return min(1.0, 0.6 + 0.4 * overlap / span)
    # No overlap: penalize by distance below the user's floor.
    if h_max < w_min:
        return max(0.0, 0.5 - (w_min - h_max) / max(1, w_min))
    return 0.5


def _implied_seniority(job: JobPosting) -> Optional[int]:
    # Prefer the structured seniority parsed at ingestion; fall back to the text.
    if job.seniority and job.seniority.lower() in _SENIORITY_RANK:
        return _SENIORITY_RANK[job.seniority.lower()]
    text = (job.title + " " + job.description).lower()
    best: Optional[int] = None
    for level, hints in _SENIORITY_HINTS.items():
        if any(h in text for h in hints):
            rank = _SENIORITY_RANK[level]
            best = rank if best is None else max(best, rank)
    return best


def seniority_fit(profile: UserProfile, job: JobPosting) -> float:
    want = profile.preferences.seniority
    if not want:
        return 0.7
    want_rank = _SENIORITY_RANK.get(want.lower())
    job_rank = _implied_seniority(job)
    if want_rank is None or job_rank is None:
        return 0.7
    diff = abs(want_rank - job_rank)
    return max(0.0, 1.0 - 0.25 * diff)


def recency_fit(job: JobPosting) -> float:
    """Fresher postings score higher; unknown age is neutral (never penalized).
    ~1.0 for the last few days, decaying to ~0.2 by ~90 days old."""
    age = job.age_days
    if age is None:
        return 0.5
    if age <= 3:
        return 1.0
    if age >= 90:
        return 0.15
    return round(1.0 - 0.85 * (age - 3) / 87, 3)
