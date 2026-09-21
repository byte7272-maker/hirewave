"""Suggested job titles — surface roles the user is qualified for.

Users often search only the title they already hold and miss adjacent roles they'd
be a strong fit for. This engine builds a ranked list of suggested titles from the
user's résumé (skills, target role) and their interaction history (recent searches,
saved jobs, applications), drawn from two sources:

* **Live postings** — distinct titles in the user's category/skill space that are
  actually open right now (grounded, with an open-role count and a sample job).
* **Adjacent roles** — a curated map of neighbouring titles per category, so we can
  point out qualified-for roles the user has not searched even when the live pool is
  thin.

Titles the user has already searched are flagged ``known`` and de-prioritised, so
the list leads with roles they may not be aware of. Deterministic and offline; an
LLM, when present, adds extra adjacent titles (grounded in the résumé).
"""

from __future__ import annotations

import re
from typing import Optional

from jobsearch.llm import LLMProvider, build_llm
from jobsearch.models import JobPosting, Resume, UserProfile
from jobsearch.models.common import DomainModel
from jobsearch.engines.sourcing.skills import detect_category, detect_seniority, extract_skills


class TitleSuggestion(DomainModel):
    title: str
    category: str = ""
    seniority: str = ""
    reason: str = ""
    source: str = ""  # "market" (live postings) | "adjacent" (curated/AI)
    sample_job_id: str = ""
    open_roles: int = 0  # live postings currently matching this title
    known: bool = False  # user has already searched/interacted with this title


class SuggestionResult(DomainModel):
    recent_titles: list[str] = []  # what the user recently searched (most-recent first)
    based_on: dict = {}  # {resume_id, categories, seniority, skills}
    suggestions: list[TitleSuggestion] = []


# Curated neighbouring titles per broad category — the "you may also be qualified
# for" set, used to surface roles even when the live pool is sparse.
_ADJACENT: dict[str, list[str]] = {
    "IT & Systems": [
        "IT Operations Manager", "Infrastructure Manager", "Service Delivery Manager",
        "IT Service Manager", "Technical Operations Manager", "Systems Administrator",
        "Network Operations Manager", "IT Director", "Head of IT", "Cloud Operations Manager",
    ],
    "Engineering": [
        "Software Engineer", "Backend Engineer", "Platform Engineer", "DevOps Engineer",
        "Site Reliability Engineer", "Engineering Manager", "Solutions Architect",
    ],
    "Data & Analytics": [
        "Data Analyst", "Data Engineer", "Analytics Engineer", "BI Developer",
        "Data Scientist", "Analytics Manager",
    ],
    "Product": [
        "Product Manager", "Technical Product Manager", "Product Owner", "Program Manager",
    ],
    "Operations": [
        "Operations Manager", "Business Operations Manager", "Program Manager", "Supply Chain Manager",
    ],
    "Customer Success & Support": [
        "Customer Success Manager", "Support Engineer", "Technical Account Manager",
    ],
    "Marketing": ["Growth Marketing Manager", "Content Strategist", "Demand Generation Manager"],
    "Sales": ["Account Executive", "Account Manager", "Business Development Manager", "Sales Engineer"],
    "Finance & Accounting": ["Financial Analyst", "FP&A Manager", "Controller"],
    "People & HR": ["Talent Acquisition Manager", "HR Business Partner", "People Operations Manager"],
    "Design": ["Product Designer", "UX Designer", "UX Researcher"],
}
# A plausible-title shape for filtering LLM output (2-6 words, letters/&/-/space).
_TITLE_RE = re.compile(r"^[A-Za-z][A-Za-z&/\-\+ ]{2,48}$")


def _norm(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


class SuggestionEngine:
    def __init__(self, llm: Optional[LLMProvider] = None) -> None:
        self.llm = llm or build_llm()

    def suggest(
        self,
        profile: UserProfile,
        *,
        resume: Optional[Resume] = None,
        jobs: list[JobPosting],
        known_titles: Optional[set[str]] = None,
        limit: int = 12,
        use_llm: bool = True,
    ) -> SuggestionResult:
        known_titles = known_titles or set()
        recent_titles = [s.role for s in getattr(profile, "recent_searches", [])]

        resume_text = (resume.rendered_text or "") if resume else ""
        target_role = getattr(resume, "target_role", "") if resume else ""
        skills = list(dict.fromkeys([*(profile.skills or []), *extract_skills(resume_text, limit=25)]))
        skills_low = {s.lower() for s in skills}
        seniority = detect_seniority(f"{resume_text}\n{target_role}") or (profile.preferences.seniority or "")

        # Where the user plays: explicit prefs + résumé + the roles they've touched.
        cats: set[str] = set(profile.preferences.job_categories or [])
        if resume:
            c = detect_category(f"{target_role} {target_role} {resume_text[:2000]}")
            if c and c != "Other":
                cats.add(c)
        for t in [*known_titles, *recent_titles]:
            c = detect_category(t)
            if c and c != "Other":
                cats.add(c)

        known_norm = {_norm(t) for t in [*known_titles, *recent_titles] if t}

        # --- live-posting candidates: distinct titles in the user's space --------
        buckets: dict[str, dict] = {}
        for j in jobs:
            if cats and (j.category or "Other") not in cats:
                continue
            key = _norm(j.title)
            if not key:
                continue
            text = f"{j.title} {' '.join(j.requirements)} {j.description}".lower()
            overlap = sum(1 for s in skills_low if s in text)
            b = buckets.get(key)
            if b is None:
                buckets[key] = {
                    "title": j.title, "category": j.category or "Other",
                    "seniority": j.seniority or "", "count": 1,
                    "sample": j.id, "overlap": overlap,
                }
            else:
                b["count"] += 1
                if overlap > b["overlap"]:
                    b["overlap"] = overlap

        suggestions: list[tuple[float, TitleSuggestion]] = []
        for key, b in buckets.items():
            known = key in known_norm
            score = b["overlap"] * 3 + min(b["count"], 5)
            if seniority and b["seniority"] == seniority:
                score += 2
            if not known:
                score += 4  # discovery: lead with roles they haven't searched
            if b["overlap"]:
                reason = f"Matches {b['overlap']} of your skills; {b['count']} open role(s)."
            else:
                reason = f"{b['count']} open role(s) in {b['category']}."
            if known:
                reason = "You've searched this. " + reason
            suggestions.append((score, TitleSuggestion(
                title=b["title"], category=b["category"], seniority=b["seniority"],
                reason=reason, source="market", sample_job_id=b["sample"],
                open_roles=b["count"], known=known,
            )))

        seen = set(buckets.keys())

        # --- curated adjacent roles: qualified-for titles they may not know ------
        for cat in (cats or set()):
            for title in _ADJACENT.get(cat, []):
                key = _norm(title)
                if key in seen:
                    continue
                seen.add(key)
                known = key in known_norm
                score = 3 + (0 if known else 3)
                suggestions.append((score, TitleSuggestion(
                    title=title, category=cat, seniority=seniority,
                    reason="Adjacent role in " + cat + " you may not have considered.",
                    source="adjacent", known=known,
                )))

        # --- optional LLM adjacency (grounded, additive) -------------------------
        if use_llm and (resume_text or skills):
            for title in self._llm_adjacent(resume_text, skills, recent_titles):
                key = _norm(title)
                if key in seen or not _TITLE_RE.match(title):
                    continue
                seen.add(key)
                suggestions.append((2.0, TitleSuggestion(
                    title=title.strip(), category=detect_category(title), seniority=seniority,
                    reason="Related role suggested from your background.",
                    source="adjacent", known=key in known_norm,
                )))

        # Lead with unknown roles, then by score.
        suggestions.sort(key=lambda t: (t[1].known, -t[0], t[1].title.lower()))
        top = [s for _, s in suggestions][:limit]
        return SuggestionResult(
            recent_titles=recent_titles[:10],
            based_on={
                "resume_id": resume.id if resume else "",
                "categories": sorted(cats),
                "seniority": seniority,
                "skills": skills[:15],
            },
            suggestions=top,
        )

    def _llm_adjacent(self, resume_text: str, skills: list[str], recent: list[str]) -> list[str]:
        """Ask the LLM for extra adjacent job titles; strict, filtered, never fatal."""
        try:
            prompt = (
                "Candidate skills: " + ", ".join(skills[:15]) + "\n"
                + ("Recent searches: " + ", ".join(recent[:6]) + "\n" if recent else "")
                + (f"Resume excerpt:\n{resume_text[:1500]}\n" if resume_text else "")
                + "\nList 6 job TITLES this candidate is likely qualified for but may not have "
                "considered. Titles only, one per line, no numbering or commentary."
            )
            out = self.llm.complete(
                prompt, system="You suggest realistic, adjacent job titles. Output titles only.",
                max_tokens=120,
            )
            titles = [ln.strip(" -*\t") for ln in (out or "").splitlines() if ln.strip()]
            return [t for t in titles if _TITLE_RE.match(t)][:6]
        except Exception:  # noqa: BLE001 - suggestions must never fail on the LLM
            return []
