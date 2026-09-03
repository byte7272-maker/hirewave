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
