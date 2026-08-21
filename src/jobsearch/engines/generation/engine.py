"""GenerationEngine — tailored, ATS-optimized resumes & cover letters.

Design: the engine assembles the *structured* resume deterministically from the
user's profile (so output is coherent even offline), then uses the LLM only for
the narrative pieces — the professional summary and the cover letter. Job
keywords are extracted and any missing ones are surfaced for injection, and an
``ats_score`` is computed. Every document is returned **unapproved**; the
platform must surface it for user review before submission (section 6.2 gate).
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from jobsearch.engines.generation.ats import ats_score, extract_keywords, missing_keywords
from jobsearch.llm import LLMProvider, build_llm
from jobsearch.models import CoverLetter, JobPosting, Resume, ResumeFormat, UserProfile
from jobsearch.models.document import ResumeContent


class Tone(str, Enum):
    PROFESSIONAL = "professional"
    ENTHUSIASTIC = "enthusiastic"
    CONCISE = "concise"


_TONE_GUIDANCE = {
    Tone.PROFESSIONAL: "Use a confident, professional, measured tone.",
    Tone.ENTHUSIASTIC: "Use a warm, energetic, enthusiastic tone while staying credible.",
    Tone.CONCISE: "Be concise and punchy; short sentences, no filler.",
}


class GenerationEngine:
    def __init__(self, llm: Optional[LLMProvider] = None) -> None:
        self.llm = llm or build_llm()

    # -- resume -------------------------------------------------------------
    def generate_resume(
        self,
        profile: UserProfile,
        job: JobPosting,
        *,
        tone: Tone = Tone.PROFESSIONAL,
        format: ResumeFormat = ResumeFormat.MARKDOWN,
        version: int = 1,
    ) -> Resume:
        job_keywords = extract_keywords(job.to_matching_text())

        # Deterministic structured assembly from the profile.
        experience_blocks = self._experience_blocks(profile)
        education_blocks = [
            f"{e.degree} {e.field_of_study}".strip() + f" — {e.institution}"
            for e in profile.education
        ]

        # Keyword injection: profile skills the job asks for, plus gaps the user
        # genuinely has evidence for are prioritized to the front.
        skills = self._prioritized_skills(profile, job_keywords)

        summary = self._generate_summary(profile, job, tone)

        content = ResumeContent(
            summary=summary,
            skills=skills,
            experience=experience_blocks,
            education=education_blocks,
        )
        resume = Resume(
            user_id=profile.user_id,
            target_role=job.title or (profile.preferences.target_roles or ["General"])[0],
            job_posting_id=job.id,
            version=version,
            format=format,
            tone=tone.value,
            generated_content=content,
        )
        resume.rendered_text = self.render_resume_text(resume, profile)

        # ATS scoring: real trackers weight the explicit requirements most, so
        # blend requirement coverage (70%) with broader description-keyword
        # coverage (30%). With no stated requirements, fall back to keywords.
        req_keywords = [r.lower() for r in job.requirements if r.strip()]
        rendered_lower = resume.rendered_text.lower()
        if req_keywords:
            req_cov = ats_score(resume.rendered_text, req_keywords)
            desc_cov = ats_score(resume.rendered_text, job_keywords)
            resume.ats_score = round(0.7 * req_cov + 0.3 * desc_cov, 1)
        else:
            resume.ats_score = ats_score(resume.rendered_text, job_keywords)

        all_keywords = list(dict.fromkeys(req_keywords + job_keywords))
        content.keywords_injected = [kw for kw in all_keywords if kw in rendered_lower]
        resume.generated_content = content
        return resume

    def _experience_blocks(self, profile: UserProfile) -> list[str]:
        blocks: list[str] = []
        for exp in profile.work_experience:
            header = f"{exp.title} — {exp.company}"
            if exp.start or exp.end:
                header += f" ({exp.start or '?'}–{exp.end or 'present'})"
            bullets = exp.highlights or ([exp.summary] if exp.summary else [])
            block = header + "".join(f"\n  - {b}" for b in bullets if b)
            blocks.append(block)
        return blocks

    @staticmethod
    def _prioritized_skills(profile: UserProfile, job_keywords: list[str]) -> list[str]:
        have = {s.lower(): s for s in profile.skills}
        prioritized: list[str] = []
        # Skills the job asks for AND the candidate has go first.
        for kw in job_keywords:
            if kw in have and have[kw] not in prioritized:
                prioritized.append(have[kw])
        # Remaining candidate skills preserve original order.
        for s in profile.skills:
            if s not in prioritized:
                prioritized.append(s)
        return prioritized

    def _generate_summary(self, profile: UserProfile, job: JobPosting, tone: Tone) -> str:
        top_skills = ", ".join(profile.skills[:6])
        system = (
            "You write concise, ATS-friendly resume professional-summary paragraphs "
            "(2-3 sentences, first person implied, no clichés). "
            + _TONE_GUIDANCE[tone]
        )
        prompt = (
            f"Role: {job.title or 'target role'}\n"
            f"Company: {job.company or 'the company'}\n"
            f"Candidate: {profile.headline or 'Experienced professional'}\n"
            f"Top skills: {top_skills}\n\n"
            f"Candidate profile:\n{profile.to_context_text()}\n\n"
            f"Job description:\n{job.description[:1500]}\n\n"
            "Write only the professional summary paragraph."
        )
        return self.llm.complete(prompt, system=system, temperature=0.5, max_tokens=300).strip()

    def render_resume_text(self, resume: Resume, profile: UserProfile) -> str:
        c = resume.generated_content
        lines = [
            f"# {profile.headline or resume.target_role}",
            "",
            "## Summary",
            c.summary,
            "",
            "## Skills",
            ", ".join(c.skills),
            "",
            "## Experience",
        ]
        lines.extend(c.experience)
        if c.education:
            lines += ["", "## Education", *c.education]
        return "\n".join(lines).strip()

    # -- cover letter -------------------------------------------------------
    def generate_cover_letter(
        self,
        profile: UserProfile,
        job: JobPosting,
        *,
        resume: Optional[Resume] = None,
        tone: Tone = Tone.PROFESSIONAL,
    ) -> CoverLetter:
        top_skills = ", ".join(profile.skills[:6])
        system = (
            "You write tailored, authentic cover letters (3 short paragraphs). "
            "Never fabricate experience the candidate does not have. "
            + _TONE_GUIDANCE[tone]
        )
        prompt = (
            f"Role: {job.title or 'target role'}\n"
            f"Company: {job.company or 'the company'}\n"
            f"Candidate: {profile.headline or profile.user_id}\n"
            f"Top skills: {top_skills}\n\n"
            f"Candidate profile:\n{profile.to_context_text()}\n\n"
            f"Job description:\n{job.description[:1500]}\n\n"
            "Write a cover letter for this specific role and company."
        )
        content = self.llm.complete(prompt, system=system, temperature=0.6, max_tokens=600).strip()
        return CoverLetter(
            user_id=profile.user_id,
            job_posting_id=job.id,
            resume_id=resume.id if resume else None,
            tone=tone.value,
            content=content,
        )

    # -- human-in-the-loop gate --------------------------------------------
    @staticmethod
    def approve(document: Resume | CoverLetter) -> Resume | CoverLetter:
        """Mark a document as user-approved (the mandatory review gate)."""
        document.approved = True
        return document

    def missing_ats_keywords(self, resume: Resume, job: JobPosting) -> list[str]:
        """Job keywords not yet reflected in the resume — for the edit UI."""
        return missing_keywords(resume.rendered_text, extract_keywords(job.to_matching_text()))
