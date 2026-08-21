"""InterviewEngine — suggest interview questions with résumé-grounded answers.

Design mirrors the generation engine: the *question set* is derived
deterministically from the candidate's profile, the target job, and skill gaps
(so it works offline and is predictable), while each *suggested answer* is
drafted by the LLM grounded strictly in the candidate's résumé/document —
instructed never to fabricate employers, titles, metrics, or skills.
"""

from __future__ import annotations

from typing import Optional

from jobsearch.llm import LLMProvider, build_llm
from jobsearch.models import (
    InterviewPrep,
    InterviewQuestion,
    JobPosting,
    QuestionCategory,
    Resume,
    UserProfile,
)

_COACH_SYSTEM = (
    "You are an expert interview coach. Draft a concise answer (3-5 sentences) the "
    "candidate can adapt in their own voice. Use ONLY facts present in the "
    "candidate's résumé/profile — never invent employers, job titles, metrics, "
    "dates, or skills the candidate does not have. For behavioral questions use the "
    "STAR structure (Situation, Task, Action, Result). If the résumé lacks a "
    "relevant example, say so briefly and suggest what kind of example to prepare."
)

_BEHAVIORAL = [
    (
        "Tell me about a challenging project you worked on and how you approached it.",
        "Pick a project with a measurable outcome; structure it with STAR.",
    ),
    (
        "Describe a time you disagreed with a teammate or manager. How did you handle it?",
        "Show empathy and a focus on the shared goal, not on winning.",
    ),
    (
        "Tell me about a time you failed or made a mistake, and what you learned.",
        "Own it honestly, then emphasize the concrete change you made afterward.",
    ),
]


class InterviewEngine:
    def __init__(self, llm: Optional[LLMProvider] = None) -> None:
        self.llm = llm or build_llm()

    def generate(
        self,
        profile: UserProfile,
        *,
        resume: Optional[Resume] = None,
        job: Optional[JobPosting] = None,
        count: int = 6,
    ) -> InterviewPrep:
        count = max(3, min(count, 12))
        document_text = (resume.rendered_text if resume else "").strip()
        based_on_document = bool(document_text)
        context = document_text or profile.to_context_text()

        questions = self._derive_questions(profile, job)[:count]
        for q in questions:
            q.suggested_answer = self._answer(q, profile, job, context)

        return InterviewPrep(
            user_id=profile.user_id,
            resume_id=resume.id if resume else None,
            job_posting_id=job.id if job else None,
            based_on_document=based_on_document,
            questions=questions,
        )

    # -- question derivation ------------------------------------------------
    def _derive_questions(
        self, profile: UserProfile, job: Optional[JobPosting]
    ) -> list[InterviewQuestion]:
        Q = InterviewQuestion
        out: list[InterviewQuestion] = [
            Q(
                category=QuestionCategory.INTRO,
                question="Tell me about yourself and your background.",
                tips="Keep it ~90 seconds: present, then past, then why this role.",
            ),
            Q(
                category=QuestionCategory.MOTIVATION,
                question=(
                    f"Why are you interested in the {job.title} role at {job.company}?"
                    if job and job.title
                    else "What are you looking for in your next role?"
                ),
                tips="Connect the role's mission to your genuine motivations.",
            ),
        ]

        # Technical / skill deep-dives — job requirements first, then top skills.
        skills = list(job.requirements) if job and job.requirements else []
        for s in profile.skills:
            if s not in skills:
                skills.append(s)
        for skill in skills[:2]:
            out.append(
                Q(
                    category=QuestionCategory.TECHNICAL,
                    question=f"Can you describe your hands-on experience with {skill}?",
                    tips=f"Give a specific example where {skill} drove a result.",
                )
            )

        for text, tip in _BEHAVIORAL[:2]:
            out.append(Q(category=QuestionCategory.BEHAVIORAL, question=text, tips=tip))

        if profile.work_experience:
            exp = profile.work_experience[0]
            out.append(
                Q(
                    category=QuestionCategory.EXPERIENCE,
                    question=(
                        f"Walk me through your role at {exp.company} and your key contributions."
                    ),
                    tips="Lead with impact and ownership, not just responsibilities.",
                )
            )

        # Gap questions — requirements the candidate can't evidence from skills.
        if job and job.requirements:
            have = " ".join(profile.skills).lower()
            gaps = [r for r in job.requirements if r.lower() not in have]
            for gap in gaps[:1]:
                out.append(
                    Q(
                        category=QuestionCategory.GAP,
                        question=(
                            f"This role emphasizes {gap}. How would you get up to speed quickly?"
                        ),
                        tips="Show a credible learning plan and any adjacent experience.",
                    )
                )

        out.append(
            Q(
                category=QuestionCategory.CLOSING,
                question="Where do you see yourself professionally in a few years?",
                tips="Align your growth with a realistic path in this role.",
            )
        )
        return out

    # -- answer drafting ----------------------------------------------------
    def _answer(
        self,
        q: InterviewQuestion,
        profile: UserProfile,
        job: Optional[JobPosting],
        context: str,
    ) -> str:
        top_skills = ", ".join(profile.skills[:6])
        prompt = (
            f"Role: {job.title if job and job.title else 'the target role'}\n"
            f"Company: {job.company if job and job.company else 'the company'}\n"
            f"Candidate: {profile.headline or 'the candidate'}\n"
            f"Top skills: {top_skills}\n"
            f"Question ({q.category.value}): {q.question}\n\n"
            f"Candidate résumé / profile:\n{context[:4000]}\n\n"
            "Write the suggested answer only."
        )
        return self.llm.complete(prompt, system=_COACH_SYSTEM, max_tokens=300).strip()
