"""ResumeAssistant — review a résumé and revise it under prompt control.

Two capabilities:

* ``review`` — deterministic-first analysis (like the vocabulary analyzer): a
  0-100 score, strengths, and concrete suggested changes, plus (if a target job
  is given) the job keywords the résumé is missing. Works fully offline; an LLM,
  when present, adds a natural one-paragraph summary.
* ``revise`` — a prompt-controlled rewrite: the user says what they want ("make
  it more concise", "emphasise leadership", "tailor to a PM role") and the LLM
  rewrites the résumé grounded strictly in its existing facts, never inventing
  employers, titles, or metrics. Returns a *preview* to review before applying.
"""

from __future__ import annotations

import re
from typing import Optional

from jobsearch.llm import LLMProvider, build_llm
from jobsearch.models import (
    CoverLetter,
    CoverLetterReview,
    CoverLetterRevision,
    JobPosting,
    Resume,
    ResumeReview,
    ResumeRevision,
    ResumeSuggestion,
)

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")
_METRIC_RE = re.compile(r"\d|%|\$")
_WEAK = {
    "responsible for", "worked on", "helped with", "assisted with", "duties included",
    "in charge of", "tasked with", "involved in",
}
_STRONG_HINT = {
    "led", "built", "drove", "launched", "delivered", "owned", "shipped", "increased",
    "reduced", "improved", "created", "designed", "scaled", "optimized", "spearheaded",
}
_REVISE_SYSTEM = (
    "You are an expert résumé editor. Rewrite the candidate's résumé to satisfy the "
    "user's instruction, using ONLY facts already present — never invent employers, "
    "titles, dates, metrics, or skills. Keep it truthful, well-structured, and ATS-"
    "friendly. Return only the revised résumé text."
)
_CL_REVISE_SYSTEM = (
    "You are an expert cover-letter editor. Rewrite the cover letter to satisfy the "
    "user's instruction, using ONLY facts already present — never invent employers, "
    "achievements, or metrics. Keep it targeted, genuine, and concise. Return only "
    "the revised cover letter."
)
# Overused, generic cover-letter phrasing worth cutting.
_CL_CLICHES = [
    "i am writing to express my interest", "to whom it may concern", "team player",
    "hard worker", "hit the ground running", "perfect fit", "think outside the box",
    "wide range of", "detail-oriented", "self-starter", "go-getter",
]


class ResumeAssistant:
    def __init__(self, llm: Optional[LLMProvider] = None) -> None:
        self.llm = llm or build_llm()

    # -- review -------------------------------------------------------------
    def review(self, resume: Resume, *, job: Optional[JobPosting] = None) -> ResumeReview:
        text = (resume.rendered_text or "").strip()
        words = _WORD_RE.findall(text)
        wc = len(words)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        bullets = [ln for ln in lines if re.match(r"^[-*•\d.]", ln)]
        quantified = [ln for ln in bullets if _METRIC_RE.search(ln)]
        lower = text.lower()
        weak_hits = [w for w in _WEAK if w in lower]
        has_action = any(v in lower for v in _STRONG_HINT)

        missing_keywords: list[str] = []
        if job and job.requirements:
            for req in job.requirements:
                if req.lower() not in lower:
                    missing_keywords.append(req)

        suggestions: list[ResumeSuggestion] = []
        strengths: list[str] = []

        if wc == 0:
            return ResumeReview(
                resume_id=resume.id,
                summary="No readable résumé text yet — upload or generate one first.",
            )

        # Quantified impact
        if bullets and len(quantified) / max(1, len(bullets)) < 0.4:
            suggestions.append(ResumeSuggestion(
                category="impact", severity="important",
                title="Quantify your impact",
                detail="Fewer than half your bullets have numbers. Add metrics "
                       "(%, $, counts, time saved) so results are concrete.",
            ))
        elif quantified:
            strengths.append("Uses concrete metrics to show impact.")

        # Weak verbs
        if weak_hits:
            suggestions.append(ResumeSuggestion(
                category="impact", severity="important",
                title="Replace weak phrases with strong action verbs",
                detail="Phrases like " + ", ".join(sorted(weak_hits)[:3]) +
                       " read as duties. Lead bullets with verbs like led, built, drove.",
            ))
        elif has_action:
            strengths.append("Leads with strong action verbs.")

        # Length
        if wc < 200:
            suggestions.append(ResumeSuggestion(
                category="length", severity="suggestion",
                title="Add more substance",
                detail=f"At ~{wc} words this is quite short. Expand on scope, "
                       "responsibilities, and outcomes.",
            ))
        elif wc > 900:
            suggestions.append(ResumeSuggestion(
                category="length", severity="suggestion",
                title="Tighten for length",
                detail=f"At ~{wc} words it's long. Trim to the most relevant, "
                       "high-impact points (aim ~1–2 pages).",
            ))
        else:
            strengths.append("Well-judged length.")

        # Keyword coverage vs the job
        if missing_keywords:
            suggestions.append(ResumeSuggestion(
                category="keywords", severity="critical" if len(missing_keywords) > 3 else "important",
                title="Cover the job's key requirements",
                detail="This role emphasises " + ", ".join(missing_keywords[:6]) +
                       ". If you have that experience, surface it explicitly (ATS scans for it).",
            ))
        elif job and job.requirements:
            strengths.append("Covers the target role's stated requirements.")

        # Structure
        if not bullets:
            suggestions.append(ResumeSuggestion(
                category="structure", severity="suggestion",
                title="Use bullet points",
                detail="Break dense paragraphs into bullets — easier to scan for "
                       "both recruiters and ATS.",
            ))

        score = 100
        score -= 18 if (bullets and len(quantified) / max(1, len(bullets)) < 0.4) else 0
        score -= 12 if weak_hits else 0
        score -= min(20, 5 * len(missing_keywords))
        score -= 10 if (wc < 200 or wc > 900) else 0
        score -= 8 if not bullets else 0
        score = max(0, min(100, score))

        summary = self._summary(resume, job, score, strengths, suggestions)
        return ResumeReview(
            resume_id=resume.id,
            score=score,
            summary=summary,
            strengths=strengths,
            suggestions=sorted(
                suggestions,
                key=lambda s: {"critical": 0, "important": 1, "suggestion": 2}[s.severity],
            ),
            missing_keywords=missing_keywords,
            word_count=wc,
        )

    def _summary(self, resume, job, score, strengths, suggestions) -> str:
        """A one-paragraph assessment. Uses the LLM when available, else a
        deterministic fallback so review never depends on the network."""
        try:
            prompt = (
                f"Résumé (excerpt):\n{(resume.rendered_text or '')[:2500]}\n\n"
                f"Target role: {job.title if job else 'general'}\n"
                f"Score: {score}/100. Top issues: "
                + "; ".join(s.title for s in suggestions[:3])
                + "\nWrite a concise, encouraging one-paragraph résumé assessment."
            )
            out = self.llm.complete(prompt, system="You are an expert résumé reviewer.",
                                    max_tokens=180).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break review on LLM error
            pass
        top = suggestions[0].title.lower() if suggestions else "a few small refinements"
        return (
            f"This résumé scores {score}/100. "
            + (f"Strengths: {strengths[0].lower()} " if strengths else "")
            + (f"The biggest opportunity is to {top}." if suggestions else "It's in good shape.")
        )

    # -- revise -------------------------------------------------------------
    def revise(
        self, resume: Resume, instruction: str, *, job: Optional[JobPosting] = None
    ) -> ResumeRevision:
        instruction = (instruction or "").strip()
        base = (resume.rendered_text or "").strip()
        if not instruction:
            raise ValueError("an instruction is required (e.g. 'make it more concise')")
        if not base:
            raise ValueError("this résumé has no text to revise")
        prompt = (
            f"Instruction: {instruction}\n"
            + (f"Target role: {job.title} at {job.company}\n" if job else "")
            + f"\nCurrent résumé:\n{base[:6000]}\n\nRewrite it accordingly."
        )
        try:
            preview = self.llm.complete(prompt, system=_REVISE_SYSTEM, max_tokens=1200).strip()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("revision service is unavailable right now") from exc
        return ResumeRevision(resume_id=resume.id, instruction=instruction, preview=preview or base)

    # -- cover letters ------------------------------------------------------
    def review_cover_letter(
        self, cover_letter: CoverLetter, *, job: Optional[JobPosting] = None
    ) -> CoverLetterReview:
        text = (cover_letter.content or "").strip()
        wc = len(_WORD_RE.findall(text))
        lower = text.lower()
        if wc == 0:
            return CoverLetterReview(
                cover_letter_id=cover_letter.id,
                summary="No cover-letter text yet — upload or generate one first.",
            )

        suggestions: list[ResumeSuggestion] = []
        strengths: list[str] = []

        # Length — cover letters read best around 150–400 words.
        if wc < 120:
            suggestions.append(ResumeSuggestion(
                category="length", severity="important", title="Add substance",
                detail=f"At ~{wc} words this is thin. Add a specific, relevant "
                       "achievement and why this role/company.",
            ))
        elif wc > 500:
            suggestions.append(ResumeSuggestion(
                category="length", severity="suggestion", title="Tighten it",
                detail=f"At ~{wc} words it's long. Aim for 250–400 — recruiters skim.",
            ))
        else:
            strengths.append("Good length for a cover letter.")

        # Clichés / generic phrasing.
        hits = [c for c in _CL_CLICHES if c in lower]
        if hits:
            suggestions.append(ResumeSuggestion(
                category="clarity", severity="important",
                title="Cut generic phrases",
                detail="Replace clichés like " + ", ".join(f'“{h}”' for h in hits[:3]) +
                       " with specific, personal detail.",
            ))

        # Specificity — a concrete achievement (numbers) lands.
        if not _METRIC_RE.search(text):
            suggestions.append(ResumeSuggestion(
                category="impact", severity="suggestion",
                title="Add a concrete result",
                detail="Include one measurable achievement (a %, number, or outcome) "
                       "to stand out from generic letters.",
            ))
        else:
            strengths.append("Backs claims with a concrete result.")

        # Personalization to the target job.
        if job:
            if job.company and job.company.lower() not in lower:
                suggestions.append(ResumeSuggestion(
                    category="structure", severity="critical",
                    title=f"Name the company",
                    detail=f"Mention {job.company} explicitly — a letter that could go to "
                           "any employer reads as mass-applied.",
                ))
            elif job.company:
                strengths.append("Personalized to the company.")

        # Sign-off present?
        if not any(s in lower for s in ("sincerely", "regards", "best,", "thank you")):
            suggestions.append(ResumeSuggestion(
                category="structure", severity="suggestion", title="Add a proper close",
                detail="End with a courteous sign-off (e.g. 'Sincerely, <name>').",
            ))

        score = 100
        score -= 12 if (wc < 120 or wc > 500) else 0
        score -= 10 if hits else 0
        score -= 10 if not _METRIC_RE.search(text) else 0
        score -= 15 if (job and job.company and job.company.lower() not in lower) else 0
        score = max(0, min(100, score))

        summary = self._cl_summary(cover_letter, job, score, strengths, suggestions)
        return CoverLetterReview(
            cover_letter_id=cover_letter.id,
            score=score,
            summary=summary,
            strengths=strengths,
            suggestions=sorted(
                suggestions,
                key=lambda s: {"critical": 0, "important": 1, "suggestion": 2}[s.severity],
            ),
            word_count=wc,
        )

    def _cl_summary(self, cl, job, score, strengths, suggestions) -> str:
        try:
            prompt = (
                f"Cover letter (excerpt):\n{(cl.content or '')[:2000]}\n\n"
                f"Target role: {job.title if job else 'general'} at "
                f"{job.company if job else 'the company'}\n"
                f"Score: {score}/100. Top issues: "
                + "; ".join(s.title for s in suggestions[:3])
                + "\nWrite a concise, encouraging one-paragraph assessment."
            )
            out = self.llm.complete(prompt, system="You are an expert cover-letter reviewer.",
                                    max_tokens=180).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001
            pass
        top = suggestions[0].title.lower() if suggestions else "a few small refinements"
        return (
            f"This cover letter scores {score}/100. "
            + (f"Strengths: {strengths[0].lower()} " if strengths else "")
            + (f"The biggest opportunity is to {top}." if suggestions else "It's in good shape.")
        )

    def revise_cover_letter(
        self, cover_letter: CoverLetter, instruction: str, *, job: Optional[JobPosting] = None
    ) -> CoverLetterRevision:
        instruction = (instruction or "").strip()
        base = (cover_letter.content or "").strip()
        if not instruction:
            raise ValueError("an instruction is required (e.g. 'make it warmer')")
        if not base:
            raise ValueError("this cover letter has no text to revise")
        prompt = (
            f"Instruction: {instruction}\n"
            + (f"Target role: {job.title} at {job.company}\n" if job else "")
            + f"\nCurrent cover letter:\n{base[:6000]}\n\nRewrite it accordingly."
        )
        try:
            preview = self.llm.complete(prompt, system=_CL_REVISE_SYSTEM, max_tokens=900).strip()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("revision service is unavailable right now") from exc
        return CoverLetterRevision(
            cover_letter_id=cover_letter.id, instruction=instruction, preview=preview or base
        )
