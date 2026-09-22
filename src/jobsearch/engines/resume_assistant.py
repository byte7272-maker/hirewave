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

import json
import re
from typing import Optional

from jobsearch.llm import LLMProvider, build_llm
from jobsearch.engines.sourcing.skills import extract_skills
from jobsearch.models import (
    CoverLetter,
    CoverLetterData,
    CoverLetterReview,
    CoverLetterRevision,
    JobPosting,
    QualityRating,
    Resume,
    ResumeBasics,
    ResumeData,
    ResumeReview,
    ResumeRevision,
    ResumeSkill,
    ResumeSuggestion,
    ResumeWork,
)


def _extract_json(text: str) -> str:
    """Pull a JSON object out of an LLM reply (strips ``` fences / prose around it)."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if start != -1 and end != -1 else text


def _grade(score: int) -> str:
    """Letter grade for a 0-100 quality score (recruiter-style banding)."""
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    return "D"


def _rating(standard: str, score: int, note: str) -> QualityRating:
    score = max(0, min(100, int(score)))
    return QualityRating(standard=standard, score=score, grade=_grade(score), note=note)

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")
_METRIC_RE = re.compile(r"\d|%|\$")
# First-person pronouns (resumes should be pronoun-free) + contact + section signals.
_PRONOUN_RE = re.compile(r"\b(i|me|my|myself|mine)\b", re.IGNORECASE)
_CONTACT_RE = re.compile(r"[\w.+-]+@[\w-]+\.\w+|\+?\d[\d\s().\-]{7,}\d")  # email or phone
_SECTION_HINTS = {
    "experience": ["experience", "employment", "work history", "professional background"],
    "education": ["education", "b.s.", "b.a.", "m.s.", "mba", "bachelor", "master", "ph.d", "degree"],
    "skills": ["skills", "technologies", "competencies", "technical proficienc"],
}


def _ats_flags(text: str, lines: list[str]) -> list[str]:
    """ATS-parseability red flags (adapted from the ats-screener rubric): layout that
    breaks single-column parsers, or filler that wastes space."""
    low = text.lower()
    flags: list[str] = []
    if sum(1 for ln in lines if ln.count(" | ") >= 2) or "\t" in text:
        flags.append("multi-column or tabbed layout (breaks ATS parsers)")
    if "references available" in low:
        flags.append("'references available' filler")
    return flags


def _missing_sections(text: str) -> list[str]:
    low = text.lower()
    missing = [name for name, hints in _SECTION_HINTS.items() if not any(h in low for h in hints)]
    if not _CONTACT_RE.search(text):
        missing.append("contact info")
    return missing
_WEAK = {
    "responsible for", "worked on", "helped with", "assisted with", "duties included",
    "in charge of", "tasked with", "involved in",
}
_STRONG_HINT = {
    "led", "built", "drove", "launched", "delivered", "owned", "shipped", "increased",
    "reduced", "improved", "created", "designed", "scaled", "optimized", "spearheaded",
}
# Expert reviewer persona + rubric, shared by every LLM call so critique is specific
# and grounded in real hiring standards (Google XYZ formula, STAR, ATS parse rules;
# rubric dimensions adapted from the MIT-licensed ats-screener project).
_EXPERT_REVIEWER = (
    "You are a senior executive resume writer and former technical recruiter who has "
    "screened thousands of resumes. Judge by concrete standards: the XYZ formula "
    "(every accomplishment states what was done, the measurable result, and how), "
    "quantified impact, strong past-tense action verbs (never 'responsible for'), ATS "
    "parseability (single column, standard section headings, no tables or graphics), "
    "tight keyword alignment to the target role, no first-person pronouns, and 1-2 "
    "page length. Be specific and candid -- name the actual weakness and cite the "
    "line; never give generic praise. Plain ASCII."
)
_REVISE_SYSTEM = (
    "You are an expert resume editor. Rewrite the candidate's resume to satisfy the "
    "user's instruction, using ONLY facts already present -- never invent employers, "
    "titles, dates, metrics, or skills. Apply the XYZ formula to each bullet "
    "(accomplishment + measurable result + method), lead with strong past-tense action "
    "verbs, cut first-person pronouns and filler, keep it ATS-friendly (single column, "
    "standard headings), and tighten toward 1-2 pages. "
    "Format the output as clean, consistent Markdown: the candidate name in **bold** at "
    "the top, section headings as '## SECTION' (e.g. Summary, Experience, Skills, "
    "Education), roles/titles in **bold**, and achievements as '-' bullet points. Use "
    "Markdown only for structure -- no tables or code blocks. Return only the revised resume."
)
_CHANGE_SYSTEM = (
    "You summarize the edits between two document versions for a changelog. State "
    "specifically what improved, by rubric dimension where relevant: quantified impact, "
    "action verbs, keyword alignment, ATS-friendliness, structure, length. Be concrete "
    "and concise; plain ASCII."
)
_CL_REVISE_SYSTEM = (
    "You are an expert cover-letter editor. Rewrite the cover letter to satisfy the "
    "user's instruction, using ONLY facts already present -- never invent employers, "
    "achievements, or metrics. Open with a specific hook (not 'I am writing to'), name "
    "the company and role, back one claim with a concrete result, cut cliches, and keep "
    "it to 250-400 words. Return only the revised cover letter."
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
    def review(
        self, resume: Resume, *, job: Optional[JobPosting] = None, narrative: bool = True
    ) -> ResumeReview:
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

        # Quantified impact — the XYZ formula (did X, measured by Y, via Z).
        if bullets and len(quantified) / max(1, len(bullets)) < 0.4:
            suggestions.append(ResumeSuggestion(
                category="impact", severity="important",
                title="Quantify impact with the XYZ formula",
                detail="Fewer than half your bullets have numbers. Rewrite them as "
                       "'Accomplished [X] measured by [Y] by doing [Z]' -- add %, $, "
                       "counts, or time saved so results are concrete, not duties.",
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
                       "high-impact points (aim for 1-2 pages).",
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
                detail="Break dense paragraphs into bullets -- easier to scan for "
                       "both recruiters and ATS.",
            ))

        # ATS parseability -- layout that trips single-column parsers.
        ats_flags = _ats_flags(text, lines)
        if ats_flags:
            suggestions.append(ResumeSuggestion(
                category="ats", severity="important",
                title="Fix ATS-unfriendly formatting",
                detail="Detected " + "; ".join(ats_flags) + ". Use a single column with "
                       "standard headings so applicant tracking systems parse it cleanly.",
            ))

        # Completeness -- the sections recruiters and parsers expect.
        missing_sections = _missing_sections(text)
        if missing_sections:
            suggestions.append(ResumeSuggestion(
                category="sections", severity="important" if "contact info" in missing_sections else "suggestion",
                title="Add the expected sections",
                detail="Missing or unlabeled: " + ", ".join(missing_sections) + ". ATS parsers "
                       "look for clear Experience, Education, Skills, and contact details.",
            ))

        # First-person pronouns -- resumes read in implied first person.
        if _PRONOUN_RE.search(text):
            suggestions.append(ResumeSuggestion(
                category="clarity", severity="suggestion",
                title="Drop first-person pronouns",
                detail="Remove 'I', 'my', and 'me'; open each line with a strong action "
                       "verb instead (recruiters expect the implied first person).",
            ))

        score = 100
        score -= 18 if (bullets and len(quantified) / max(1, len(bullets)) < 0.4) else 0
        score -= 12 if weak_hits else 0
        score -= min(20, 5 * len(missing_keywords))
        score -= 10 if (wc < 200 or wc > 900) else 0
        score -= 8 if not bullets else 0
        score = max(0, min(100, score))

        # The narrative (one-paragraph assessment + content summary) is the only
        # part that needs the LLM. Skip it for a cheap score/grade (e.g. list cards).
        summary = self._summary(resume, job, score, strengths, suggestions) if narrative else ""
        content_summary = self._content_summary(resume) if narrative else ""
        ratings = self._ratings(bullets, quantified, weak_hits, has_action, wc, job,
                                missing_keywords, ats_flags, missing_sections)
        return ResumeReview(
            resume_id=resume.id,
            score=score,
            grade=_grade(score),
            summary=summary,
            content_summary=content_summary,
            ratings=ratings,
            strengths=strengths,
            suggestions=sorted(
                suggestions,
                key=lambda s: {"critical": 0, "important": 1, "suggestion": 2}[s.severity],
            ),
            missing_keywords=missing_keywords,
            word_count=wc,
        )

    def _ratings(
        self, bullets, quantified, weak_hits, has_action, wc, job, missing_keywords,
        ats_flags=(), missing_sections=(),
    ) -> list[QualityRating]:
        """Rate the résumé against the standards recruiters actually screen on —
        a transparent breakdown behind the single overall score."""
        ratings: list[QualityRating] = []

        # Impact & results — bullets carrying concrete metrics.
        if bullets:
            ratio = len(quantified) / max(1, len(bullets))
            s = 45 + 55 * min(1.0, ratio / 0.5)
            note = f"{len(quantified)} of {len(bullets)} bullets quantify results."
        else:
            s, note = 55, "No bullet points to measure quantified impact."
        ratings.append(_rating("Impact & results", s, note))

        # Action language — strong verbs vs passive duty phrasing.
        if has_action and not weak_hits:
            s, note = 95, "Leads with strong action verbs."
        elif has_action and weak_hits:
            s, note = 72, "Strong verbs mixed with some passive phrasing."
        elif weak_hits:
            s, note = 48, "Relies on passive phrases like 'responsible for'."
        else:
            s, note = 62, "Few explicit action verbs."
        ratings.append(_rating("Action language", s, note))

        # Keywords / ATS — coverage of a target role's requirements when given.
        if job and job.requirements:
            total = len(job.requirements)
            covered = total - len(missing_keywords)
            s = 100 * covered / max(1, total)
            note = f"Covers {covered} of {total} target-role requirements."
        else:
            s, note = 75, "Add a target job to score ATS keyword coverage precisely."
        ratings.append(_rating("Keywords / ATS", s, note))

        # Structure & scannability.
        if bullets:
            s, note = 90, "Uses scannable bullet points."
        else:
            s, note = 55, "Dense paragraphs; bullets would scan better."
        ratings.append(_rating("Structure", s, note))

        # Length — ~200-900 words (roughly 1-2 pages).
        if 200 <= wc <= 900:
            s, note = 95, f"~{wc} words: well-judged length."
        elif 120 <= wc < 200 or 900 < wc <= 1200:
            s = 70
            note = f"~{wc} words: a little {'short' if wc < 200 else 'long'}."
        else:
            s = 50
            note = f"~{wc} words: {'too short' if wc < 200 else 'too long'} for a strong resume."
        ratings.append(_rating("Length", s, note))

        # ATS parseability -- single-column, parser-safe layout.
        if ats_flags:
            s = max(35, 90 - 20 * len(ats_flags))
            note = "Parser risk: " + "; ".join(list(ats_flags)[:2]) + "."
        else:
            s, note = 92, "Clean, single-column layout parses well."
        ratings.append(_rating("ATS parseability", s, note))

        # Completeness -- the expected sections are present and labeled.
        expected = 4  # experience, education, skills, contact info
        present = expected - len(missing_sections)
        s = round(100 * max(0, present) / expected)
        note = (f"Missing: {', '.join(list(missing_sections)[:4])}." if missing_sections
                else "All expected sections present.")
        ratings.append(_rating("Completeness", s, note))
        return ratings

    def _content_summary(self, resume: Resume) -> str:
        """A factual summary of WHAT the résumé says (candidate profile) — distinct
        from the quality assessment. LLM when available, deterministic fallback."""
        text = (resume.rendered_text or "").strip()
        if not text:
            return ""
        try:
            out = self.llm.complete(
                f"Résumé:\n{text[:3000]}\n\nIn 2-3 sentences, summarize WHAT this résumé says "
                "about the candidate: seniority, industries/domains, core skills, and one or two "
                "notable achievements. Summarize only; do not evaluate or give advice.",
                system="You summarize résumés factually and concisely.",
                max_tokens=170,
            ).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break review on LLM error
            pass
        skills = extract_skills(text, limit=8)
        parts = []
        if resume.target_role:
            parts.append(f"Candidate targeting {resume.target_role} roles.")
        if skills:
            parts.append("Core skills: " + ", ".join(skills) + ".")
        return " ".join(parts) or "Resume covering the candidate's professional experience and skills."

    def _summary(self, resume, job, score, strengths, suggestions) -> str:
        """A one-paragraph expert assessment. Uses the LLM (expert reviewer persona +
        rubric) when available, else a deterministic fallback so review never depends
        on the network."""
        try:
            prompt = (
                f"Resume (excerpt):\n{(resume.rendered_text or '')[:2800]}\n\n"
                f"Target role: {job.title if job else 'general'}\n"
                f"Rubric score: {score}/100. Detected issues: "
                + ("; ".join(f"{s.title} ({s.detail})" for s in suggestions[:4]) or "none")
                + "\n\nWrite a candid one-paragraph assessment (4-6 sentences). Lead with the "
                "single highest-leverage fix, ground each point in the rubric (quantified "
                "impact / action verbs / ATS parseability / keyword fit / structure / length), "
                "and reference specifics from the resume. No generic praise."
            )
            out = self.llm.complete(prompt, system=_EXPERT_REVIEWER, max_tokens=260).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break review on LLM error
            pass
        top = suggestions[0].title.lower() if suggestions else "a few small refinements"
        return (
            f"This resume scores {score}/100. "
            + (f"Strengths: {strengths[0].lower()} " if strengths else "")
            + (f"The biggest opportunity is to {top}." if suggestions else "It's in good shape.")
        )

    def qualifications(
        self, resume: Resume, job: JobPosting, *,
        fit_score: int, matching_skills: list[str], gap_skills: list[str],
    ) -> str:
        """A short perspective on how the candidate qualifies for THIS specific job —
        grounded in the résumé and the job's requirements. LLM when available, with a
        deterministic fallback so it never depends on the network."""
        text = (resume.rendered_text or "").strip()
        if not text:
            return ""
        try:
            out = self.llm.complete(
                f"Job: {job.title} at {job.company}\n"
                f"Job requirements: {', '.join(job.requirements[:12]) or 'n/a'}\n"
                f"Resume (excerpt):\n{text[:2500]}\n\n"
                f"Fit score: {fit_score}/100. Already covers: {', '.join(matching_skills[:8]) or 'n/a'}. "
                f"Gaps: {', '.join(gap_skills[:8]) or 'none'}.\n"
                "In 3-4 sentences, give a candid perspective on how well this candidate qualifies "
                "for THIS role: their most relevant, evidence-backed strengths and the specific "
                "gaps versus the requirements. Cite specifics; do not restate the score.",
                system=_EXPERT_REVIEWER,
                max_tokens=220,
            ).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break on the LLM
            pass
        strong = ", ".join(matching_skills[:4])
        gaps = ", ".join(gap_skills[:4])
        parts = [f"You look like a {fit_score}/100 fit for {job.title} at {job.company}."]
        if strong:
            parts.append(f"Your background already covers {strong}.")
        if gaps:
            parts.append(f"The role also emphasises {gaps}, which your resume does not surface yet.")
        return " ".join(parts)

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
            + f"\nCurrent resume:\n{base[:6000]}\n\nRewrite it accordingly."
        )
        try:
            preview = self.llm.complete(prompt, system=_REVISE_SYSTEM, max_tokens=1200).strip()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("revision service is unavailable right now") from exc
        return ResumeRevision(resume_id=resume.id, instruction=instruction, preview=preview or base)

    # -- structured parse (JSON Resume) ------------------------------------
    def structure(self, resume: Resume) -> ResumeData:
        """Parse a résumé's text into the JSON Resume schema (structured fields), so it
        can be rendered into any template and improved field-by-field. LLM extraction
        with a deterministic fallback; never invents facts."""
        text = (resume.rendered_text or "").strip()
        if not text:
            return ResumeData()
        try:
            out = self.llm.complete(
                "Extract the resume below into JSON Resume format. Return ONLY valid JSON with "
                "keys: basics{name,label,email,phone,url,summary,location{city,region}}, "
                "work[{name,position,startDate,endDate,summary,highlights[]}], "
                "education[{institution,area,studyType,startDate,endDate}], "
                "skills[{name,keywords[]}]. Use empty strings/arrays when unknown. Do NOT invent "
                "anything not in the text.\n\nResume:\n" + text[:4000],
                system="You extract structured data from resumes and output only JSON.",
                max_tokens=1600,
            )
            data = json.loads(_extract_json(out))
            parsed = ResumeData.model_validate(data)
            if parsed.basics.name or parsed.work or parsed.skills:
                return parsed
        except Exception:  # noqa: BLE001 - fall back to heuristics
            pass
        # Deterministic fallback: name from the first line, skills mined, summary.
        lines = [ln.strip().lstrip("#* ").strip() for ln in text.splitlines() if ln.strip()]
        name = lines[0] if lines else ""
        if len(name) > 60 or "@" in name:  # first line wasn't a name
            name = ""
        skills = extract_skills(text, limit=20)
        return ResumeData(
            basics=ResumeBasics(name=name, label=resume.target_role, summary=text[:500]),
            skills=[ResumeSkill(name=s) for s in skills],
        )

    def improve_structured(
        self, resume: Resume, *, instruction: str = "", job: Optional[JobPosting] = None
    ) -> ResumeData:
        """Improve a résumé and return it as structured JSON Resume (so improvements
        apply per-field and a template's formatting stays intact). Rewrites highlights
        with the XYZ formula, tightens the summary, quantifies impact -- using ONLY
        facts present. LLM with a deterministic fallback (returns the parsed structure)."""
        text = (resume.rendered_text or "").strip()
        if not text:
            return ResumeData()
        reqs = ""
        if job and job.requirements:
            reqs = "\nTarget role requirements (surface where truthful): " + ", ".join(job.requirements[:12])
        focus = f" Focus improvements toward: {instruction}." if instruction else ""
        try:
            out = self.llm.complete(
                "Improve the resume below and return ONLY JSON Resume format (keys: "
                "basics{name,label,email,phone,url,summary,location{city,region}}, "
                "work[{name,position,startDate,endDate,summary,highlights[]}], "
                "education[{institution,area,studyType,startDate,endDate}], skills[{name,keywords[]}]). "
                "Apply the XYZ formula to each highlight (did X, measured by Y, via Z), lead with strong "
                "past-tense action verbs, quantify impact, and tighten the summary. Use ONLY facts already "
                "present -- never invent employers, titles, dates, metrics, or skills." + focus + reqs +
                "\n\nResume:\n" + text[:4000],
                system="You improve resumes and output only valid JSON Resume JSON.",
                max_tokens=2000,
            )
            data = json.loads(_extract_json(out))
            parsed = ResumeData.model_validate(data)
            if parsed.basics.name or parsed.work or parsed.skills:
                return parsed
        except Exception:  # noqa: BLE001 - fall back to the plain parse
            pass
        return self.structure(resume)

    # -- version change summary --------------------------------------------
    def summarize_change(
        self, old: str, new: str, *, instruction: str = "", job: Optional[JobPosting] = None
    ) -> str:
        """A 1-2 sentence summary of what changed from ``old`` to ``new`` (for a saved
        version). LLM when available, deterministic fallback otherwise. ASCII output."""
        old, new = (old or "").strip(), (new or "").strip()
        if not new:
            return ""
        ow, nw = len(_WORD_RE.findall(old)), len(_WORD_RE.findall(new))
        try:
            prompt = (
                f"Instruction: {instruction or 'general revision'}\n"
                + (f"Target role: {job.title} at {job.company}\n" if job else "")
                + f"OLD document:\n{old[:2000]}\n\nNEW document:\n{new[:2000]}\n\n"
                "In 1-2 sentences, summarize what changed from OLD to NEW (tone, emphasis, "
                "keywords, length). Be specific and concise; plain ASCII."
            )
            out = self.llm.complete(prompt, system=_CHANGE_SYSTEM, max_tokens=150).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break versioning on the LLM
            pass
        delta = nw - ow
        trend = "Expanded" if delta > 20 else ("Tightened" if delta < -20 else "Revised")
        base = trend
        if instruction:
            base += f" to {instruction.strip().rstrip('.').lower()}"
        elif job:
            base += f" for {job.title}"
        return f"{base} (~{ow} -> ~{nw} words)."

    # -- cover letters ------------------------------------------------------
    def review_cover_letter(
        self, cover_letter: CoverLetter, *, job: Optional[JobPosting] = None, narrative: bool = True
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
                detail=f"At ~{wc} words it's long. Aim for 250-400 -- recruiters skim.",
            ))
        else:
            strengths.append("Good length for a cover letter.")

        # Clichés / generic phrasing.
        hits = [c for c in _CL_CLICHES if c in lower]
        if hits:
            suggestions.append(ResumeSuggestion(
                category="clarity", severity="important",
                title="Cut generic phrases",
                detail="Replace cliches like " + ", ".join(f'"{h}"' for h in hits[:3]) +
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
                    detail=f"Mention {job.company} explicitly -- a letter that could go to "
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

        summary = self._cl_summary(cover_letter, job, score, strengths, suggestions) if narrative else ""
        content_summary = self._cl_content_summary(cover_letter) if narrative else ""
        has_metric = bool(_METRIC_RE.search(text))
        personalized = bool(job and job.company and job.company.lower() in lower)
        has_close = any(s in lower for s in ("sincerely", "regards", "best,", "thank you"))
        ratings = self._cl_ratings(wc, hits, has_metric, job, personalized, has_close)
        return CoverLetterReview(
            cover_letter_id=cover_letter.id,
            score=score,
            grade=_grade(score),
            summary=summary,
            content_summary=content_summary,
            ratings=ratings,
            strengths=strengths,
            suggestions=sorted(
                suggestions,
                key=lambda s: {"critical": 0, "important": 1, "suggestion": 2}[s.severity],
            ),
            word_count=wc,
        )

    def _cl_ratings(self, wc, cliche_hits, has_metric, job, personalized, has_close) -> list[QualityRating]:
        """Rate a cover letter against the standards recruiters screen on."""
        ratings: list[QualityRating] = []

        # Length — best around 150-400 words.
        if 150 <= wc <= 400:
            s, note = 95, f"~{wc} words: on-target length."
        elif 120 <= wc < 150 or 400 < wc <= 500:
            s, note = 75, f"~{wc} words: a little {'short' if wc < 150 else 'long'}."
        else:
            s = 50
            note = f"~{wc} words: {'too short' if wc < 150 else 'too long'} to land well."
        ratings.append(_rating("Length", s, note))

        # Specificity & impact — a concrete, measurable result.
        if has_metric:
            s, note = 90, "Backs a claim with a concrete result."
        else:
            s, note = 55, "No measurable achievement to stand out."
        ratings.append(_rating("Specificity & impact", s, note))

        # Personalization — names the target company.
        if job and job.company:
            if personalized:
                s, note = 95, "Names the target company."
            else:
                s, note = 40, "Does not name the company; reads as mass-applied."
        else:
            s, note = 70, "Add a target job to score personalization precisely."
        ratings.append(_rating("Personalization", s, note))

        # Clarity — free of generic clichés.
        if cliche_hits:
            s, note = 55, f"Uses {len(cliche_hits)} generic phrase(s) worth cutting."
        else:
            s, note = 92, "Avoids generic cliches."
        ratings.append(_rating("Clarity", s, note))

        # Structure — a proper courteous close.
        if has_close:
            s, note = 90, "Ends with a courteous sign-off."
        else:
            s, note = 60, "Add a courteous sign-off to close."
        ratings.append(_rating("Structure", s, note))
        return ratings

    def _cl_content_summary(self, cover_letter: CoverLetter) -> str:
        """A factual summary of WHAT the cover letter says (its pitch)."""
        text = (cover_letter.content or "").strip()
        if not text:
            return ""
        try:
            out = self.llm.complete(
                f"Cover letter:\n{text[:2500]}\n\nIn 1-2 sentences, summarize WHAT this cover letter "
                "argues: the role/company it targets and the candidate's main pitch. Summarize only; "
                "do not evaluate or give advice.",
                system="You summarize cover letters factually and concisely.",
                max_tokens=140,
            ).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001
            pass
        return "Cover letter presenting the candidate's interest and relevant background for the role."

    def _cl_summary(self, cl, job, score, strengths, suggestions) -> str:
        try:
            prompt = (
                f"Cover letter (excerpt):\n{(cl.content or '')[:2000]}\n\n"
                f"Target role: {job.title if job else 'general'} at "
                f"{job.company if job else 'the company'}\n"
                f"Score: {score}/100. Top issues: "
                + ("; ".join(f"{s.title} ({s.detail})" for s in suggestions[:4]) or "none")
                + "\n\nWrite a candid one-paragraph assessment (3-5 sentences). Lead with the "
                "highest-leverage fix, judge whether it opens with a specific hook, names the "
                "company/role, backs a claim with a concrete result, and avoids cliches. Cite "
                "specifics; no generic praise."
            )
            out = self.llm.complete(prompt, system=_EXPERT_REVIEWER, max_tokens=240).strip()
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

    def cl_qualifications(
        self, cover_letter: CoverLetter, job: JobPosting, *,
        fit_score: int, addressed: list[str], missing: list[str],
    ) -> str:
        """A short perspective on how well the cover letter targets THIS job — whether
        it speaks to the company/role and what it should address. LLM with fallback."""
        text = (cover_letter.content or "").strip()
        if not text:
            return ""
        try:
            out = self.llm.complete(
                f"Job: {job.title} at {job.company}\n"
                f"Job requirements: {', '.join(job.requirements[:12]) or 'n/a'}\n"
                f"Cover letter:\n{text[:2000]}\n\n"
                f"Addresses: {', '.join(addressed[:8]) or 'n/a'}. "
                f"Not yet mentioned: {', '.join(missing[:8]) or 'none'}.\n"
                "In 2-3 sentences, give a candid perspective on how well this cover letter targets THIS "
                "role -- whether it speaks to the company and the job's needs, and what it should address. "
                "Do not restate the score.",
                system="You assess how well a cover letter targets a specific job, candidly and concisely.",
                max_tokens=170,
            ).strip()
            if out:
                return out
        except Exception:  # noqa: BLE001 - never break on the LLM
            pass
        parts = [f"This letter scores {fit_score}/100 for {job.title} at {job.company}."]
        if job.company and job.company.lower() not in text.lower():
            parts.append(f"It does not name {job.company}, so it reads as generic.")
        if missing:
            parts.append("Consider addressing " + ", ".join(missing[:4]) + ".")
        elif addressed:
            parts.append("It already speaks to " + ", ".join(addressed[:4]) + ".")
        return " ".join(parts)

    _CL_KEYS = (
        "keys: name, contact[], date, company, role, salutation, paragraphs[], closing, signature"
    )

    def structure_cover_letter(self, cover_letter: CoverLetter) -> CoverLetterData:
        """Parse a cover letter into the structured shape the templates render."""
        text = (cover_letter.content or "").strip()
        if not text:
            return CoverLetterData()
        try:
            out = self.llm.complete(
                "Extract the cover letter below into JSON with " + self._CL_KEYS + ". Use empty "
                "strings/arrays when unknown. Do NOT invent anything.\n\nCover letter:\n" + text[:3000],
                system="You extract structured data from cover letters and output only JSON.",
                max_tokens=1200,
            )
            data = json.loads(_extract_json(out))
            parsed = CoverLetterData.model_validate(data)
            if parsed.paragraphs or parsed.salutation or parsed.name:
                return parsed
        except Exception:  # noqa: BLE001
            pass
        # Deterministic fallback: split into paragraphs, detect salutation/closing.
        blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
        salutation = next((b for b in blocks if b.lower().startswith(("dear", "to whom"))), "")
        closing = next((b for b in blocks if b.lower().startswith(("sincerely", "regards", "best", "thank you"))), "")
        body = [b for b in blocks if b not in (salutation, closing)]
        return CoverLetterData(salutation=salutation, paragraphs=body, closing=closing)

    def improve_cover_letter_structured(
        self, cover_letter: CoverLetter, *, instruction: str = "", job: Optional[JobPosting] = None
    ) -> CoverLetterData:
        """Improve a cover letter and return it as the structured template shape. Uses
        ONLY facts present; LLM with a deterministic fallback (the parsed structure)."""
        text = (cover_letter.content or "").strip()
        if not text:
            return CoverLetterData()
        ctx = ""
        if job:
            ctx = f"\nTarget role: {job.title} at {job.company}."
        focus = f" Focus improvements toward: {instruction}." if instruction else ""
        try:
            out = self.llm.complete(
                "Improve the cover letter below and return ONLY JSON with " + self._CL_KEYS + ". "
                "Open with a specific hook (not 'I am writing to'), name the company and role, back a "
                "claim with a concrete result, cut cliches, keep it 250-400 words. Use ONLY facts "
                "already present -- never invent employers, achievements, or metrics." + focus + ctx +
                "\n\nCover letter:\n" + text[:3000],
                system="You improve cover letters and output only valid JSON.",
                max_tokens=1400,
            )
            data = json.loads(_extract_json(out))
            parsed = CoverLetterData.model_validate(data)
            if parsed.paragraphs or parsed.salutation:
                return parsed
        except Exception:  # noqa: BLE001
            pass
        return self.structure_cover_letter(cover_letter)

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
