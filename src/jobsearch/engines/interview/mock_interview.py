"""MockInterviewTrainer — a conversational mock interview with an AI persona.

Three layers, each independently robust:

* **Question progression** is deterministic (reuses ``InterviewEngine`` to plan a
  grounded, category-covering question list) — the interview always makes sense.
* **The conversation** is LLM-driven: an AI *interviewer persona* reacts to the
  candidate's last answer in character and asks the next question naturally
  (works offline with the mock, shines with real Claude).
* **Answer rating** is heuristic (``rating.rate_answer``) — fast, consistent
  content + style scores with improvement suggestions, no LLM required.
"""

from __future__ import annotations

import hashlib
from typing import Optional

from jobsearch.engines.interview.engine import InterviewEngine
from jobsearch.engines.interview.persona_library import PersonaLibrary, avatar_for
from jobsearch.engines.interview.question_bank import QuestionBank
from jobsearch.engines.interview.rating import rate_answer
from jobsearch.llm import LLMProvider, build_llm
from jobsearch.models import (
    AnswerFeedback,
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
    InterviewTurn,
    JobPosting,
    MockInterviewSession,
    MockInterviewSummary,
    Resume,
    SessionStatus,
    UserProfile,
)
from jobsearch.models.common import utcnow

_FIRST_NAMES = [
    "Maya", "Devon", "Priya", "Marcus", "Elena", "Jordan", "Sofia", "Andre",
    "Lena", "Omar", "Grace", "Theo", "Nadia", "Chris", "Aisha", "Victor",
]
_LAST_NAMES = [
    "Chen", "Okafor", "Nguyen", "Torres", "Patel", "Rossi", "Kim", "Diallo",
    "Silva", "Haddad", "Novak", "Reyes", "Bauer", "Mensah", "Ivanova", "Cohen",
]
_ROLES = {
    InterviewerStyle.FRIENDLY: "Hiring Manager",
    InterviewerStyle.FORMAL: "Director of Engineering",
    InterviewerStyle.TECHNICAL: "Staff Engineer",
    InterviewerStyle.SKEPTICAL: "VP of Engineering",
    InterviewerStyle.BEHAVIORAL: "People & Talent Lead",
}
_STYLE_DESC = {
    InterviewerStyle.FRIENDLY: "warm, encouraging, puts candidates at ease",
    InterviewerStyle.FORMAL: "professional, structured, measured",
    InterviewerStyle.TECHNICAL: "probing and detail-oriented, digs into specifics",
    InterviewerStyle.SKEPTICAL: "challenging, presses for evidence and depth",
    InterviewerStyle.BEHAVIORAL: "focused on stories, motivations, and how you work with others",
}
# Presentation-only voice tone per style, so the client can pick a matching
# natural voice and prosody for the on-screen interviewer.
_STYLE_VOICE = {
    InterviewerStyle.FRIENDLY: "warm",
    InterviewerStyle.FORMAL: "measured",
    InterviewerStyle.TECHNICAL: "crisp",
    InterviewerStyle.SKEPTICAL: "firm",
    InterviewerStyle.BEHAVIORAL: "warm",
}
# Perceived gender of each first name in the pool — drives the avatar's face
# and the voice the client selects. Names not listed fall back to "neutral".
_NAME_GENDER = {
    "Maya": "female", "Devon": "male", "Priya": "female", "Marcus": "male",
    "Elena": "female", "Jordan": "neutral", "Sofia": "female", "Andre": "male",
    "Lena": "female", "Omar": "male", "Grace": "female", "Theo": "male",
    "Nadia": "female", "Chris": "male", "Aisha": "female", "Victor": "male",
}


def _pick(seed: str, pool: list[str]) -> str:
    idx = int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(pool)
    return pool[idx]


class MockInterviewTrainer:
    def __init__(
        self,
        llm: Optional[LLMProvider] = None,
        *,
        persona_library: Optional["PersonaLibrary"] = None,
        question_bank: Optional["QuestionBank"] = None,
    ) -> None:
        self.llm = llm or build_llm()
        self._planner = InterviewEngine(llm=self.llm)
        self.persona_library = persona_library or PersonaLibrary.from_settings()
        self.question_bank = question_bank or QuestionBank.from_settings()

    # -- persona ------------------------------------------------------------
    def create_persona(
        self,
        *,
        job: Optional[JobPosting] = None,
        style: Optional[InterviewerStyle] = None,
        persona_id: Optional[str] = None,
    ) -> InterviewerPersona:
        style = style or InterviewerStyle.FRIENDLY
        company = (job.company if job and job.company else "") or ""
        seed = f"{company}|{style.value}|{job.title if job else ''}"

        def _contextualize(p: InterviewerPersona) -> InterviewerPersona:
            # Gallery personas are generic; set them at the target company so the
            # interviewer "works there" for this session.
            if company and not p.company:
                p.company = company
            return p

        # A configured library or the built-in gallery.
        if not self.persona_library.is_empty():
            if persona_id:
                chosen = next((p for p in self.persona_library.all() if p.id == persona_id), None)
                if chosen is not None:
                    return _contextualize(chosen.model_copy(deep=True))
            resolved = self.persona_library.resolve(style=style, seed=seed)
            if resolved is not None:
                return _contextualize(resolved)

        first = _pick(seed + "f", _FIRST_NAMES)
        name = f"{first} {_pick(seed + 'l', _LAST_NAMES)}"
        role = _ROLES[style]
        initials = "".join(p[0] for p in name.split()[:2]).upper()
        gender = _NAME_GENDER.get(first, "neutral")
        voice = _STYLE_VOICE[style]

        system = (
            "Write a single-sentence professional bio for a fictional job interviewer. "
            "Neutral and concise; no pronouns."
        )
        prompt = (
            f"Candidate: interviewer\nRole: {role}\nCompany: {company or 'the company'}\n"
            f"Top skills: {_STYLE_DESC[style]}\n\nWrite the one-sentence bio."
        )
        bio = self.llm.complete(prompt, system=system, max_tokens=80).strip()
        return InterviewerPersona(
            name=name, role=role, company=company, style=style, bio=bio,
            initials=initials, gender=gender, voice=voice,
            avatar_url=avatar_for(name, gender=gender),
        )

    def _plan_questions(
        self, profile: UserProfile, job: Optional[JobPosting], style: InterviewerStyle
    ) -> list[str]:
        """Question plan for the session — user-directed bank first, else the
        résumé-grounded derivation."""
        if not self.question_bank.is_empty():
            banked = [q.question for q in self.question_bank.questions_for(style)]
            if banked:
                return banked
        return [q.question for q in self._planner._derive_questions(profile, job)]

    # -- session lifecycle --------------------------------------------------
    def start_session(
        self,
        profile: UserProfile,
        *,
        resume: Optional[Resume] = None,
        job: Optional[JobPosting] = None,
        style: Optional[InterviewerStyle] = None,
        difficulty: Optional[InterviewDifficulty] = None,
        max_questions: int = 5,
        persona_id: Optional[str] = None,
        questions: Optional[list[str]] = None,
    ) -> MockInterviewSession:
        persona = self.create_persona(job=job, style=style, persona_id=persona_id)
        # An explicit question list (e.g. searched crowdsourced questions) wins;
        # otherwise fall back to the user-directed bank / grounded derivation.
        explicit = [q.strip() for q in (questions or []) if q and q.strip()]
        planned = explicit or self._plan_questions(profile, job, persona.style)
        max_q = max(2, min(max_questions, len(planned)))

        session = MockInterviewSession(
            user_id=profile.user_id,
            persona=persona,
            resume_id=resume.id if resume else None,
            job_posting_id=job.id if job else None,
            # Explicit request wins; else the persona's own difficulty; else normal.
            difficulty=difficulty or persona.difficulty or InterviewDifficulty.NORMAL,
            plan=planned,
            max_questions=max_q,
        )
        opening = self._interviewer_turn(
            session, profile, job, question=planned[0], last_answer=None, greeting=True
        )
        session.turns.append(
            InterviewTurn(speaker="interviewer", text=opening, question=planned[0])
        )
        session.asked = 1
        return session

    def reply(
        self,
        session: MockInterviewSession,
        profile: UserProfile,
        answer: str,
        *,
        job: Optional[JobPosting] = None,
        response_seconds: Optional[float] = None,
    ) -> MockInterviewSession:
        if session.status != SessionStatus.ACTIVE:
            raise ValueError("interview session is already completed")

        feedback = rate_answer(answer, skills=profile.skills)
        session.turns.append(
            InterviewTurn(
                speaker="candidate",
                text=answer,
                feedback=feedback,
                response_seconds=response_seconds,
            )
        )

        if self._should_followup(session, feedback):
            # Press on the same question — targets the weakest dimension.
            probe = self._build_probe(feedback)
            turn = self._interviewer_turn(
                session, profile, job, question=probe, last_answer=answer, followup=True
            )
            session.turns.append(
                InterviewTurn(speaker="interviewer", text=turn, question=probe)
            )
            session.followups_this_q += 1
        elif session.asked >= session.max_questions:
            closing = self._interviewer_turn(
                session, profile, job, question="", last_answer=answer, closing=True
            )
            session.turns.append(InterviewTurn(speaker="interviewer", text=closing))
            session.status = SessionStatus.COMPLETED
            session.summary = self._summarize(session)
        else:
            next_q = session.plan[session.asked]
            turn = self._interviewer_turn(
                session, profile, job, question=next_q, last_answer=answer
            )
            session.turns.append(
                InterviewTurn(speaker="interviewer", text=turn, question=next_q)
            )
            session.asked += 1
            session.followups_this_q = 0  # fresh question, reset the probe counter

        session.updated_at = utcnow()
        return session

    # -- adaptive difficulty ------------------------------------------------
    @staticmethod
    def _should_followup(session: MockInterviewSession, feedback: AnswerFeedback) -> bool:
        if session.difficulty == InterviewDifficulty.EASY:
            return False
        cap = 2 if session.difficulty == InterviewDifficulty.HARD else 1
        if session.followups_this_q >= cap:
            return False
        if session.difficulty == InterviewDifficulty.HARD:
            return feedback.overall < 70
        # NORMAL: only challenging personas press, and only on weak answers.
        challenging = session.persona.style in {
            InterviewerStyle.SKEPTICAL,
            InterviewerStyle.TECHNICAL,
        }
        return challenging and feedback.overall < 55

    @staticmethod
    def _build_probe(feedback: AnswerFeedback) -> str:
        dims = {
            "structure": feedback.structure,
            "specificity": feedback.specificity,
            "confidence": feedback.confidence,
            "conciseness": feedback.conciseness,
        }
        weakest = min(dims, key=dims.get)
        return {
            "structure": (
                "Walk me through the specifics — what was the situation, what did you "
                "personally do, and how did it turn out?"
            ),
            "specificity": (
                "Can you give me a concrete example, ideally with a number or measurable outcome?"
            ),
            "confidence": (
                "State it plainly for me: what exactly did you do, and what was the impact?"
            ),
            "conciseness": (
                "Give me the 30-second version — what's the single most important point?"
            ),
        }[weakest]

    # -- interviewer voice --------------------------------------------------
    def _interviewer_turn(
        self,
        session: MockInterviewSession,
        profile: UserProfile,
        job: Optional[JobPosting],
        *,
        question: str,
        last_answer: Optional[str],
        greeting: bool = False,
        closing: bool = False,
        followup: bool = False,
    ) -> str:
        p = session.persona
        system = (
            f"You are {p.name}, {p.role} at {p.company or 'the company'}, conducting a "
            f"job interview. Your style is {_STYLE_DESC[p.style]}. Stay in character. "
            "Respond with a brief, natural reaction to the candidate's last answer "
            "(one sentence), then ask the next question conversationally. Under 60 words. "
            "Do NOT rate or critique the answer — just converse like a real interviewer."
        )
        if followup:
            system = (
                f"You are {p.name}, {p.role} at {p.company or 'the company'}, the interviewer. "
                f"Your style is {_STYLE_DESC[p.style]}. The candidate's last answer was thin, "
                "so ask a probing FOLLOW-UP on the SAME topic — press for a specific example "
                "or result, do not change topics. One or two sentences, under 50 words."
            )
        if greeting:
            system = (
                f"You are {p.name}, {p.role} at {p.company or 'the company'}, the interviewer. "
                f"Your style is {_STYLE_DESC[p.style]}. Warmly greet the candidate in one "
                "sentence, then ask the first question. Under 50 words."
            )
        if closing:
            system = (
                f"You are {p.name}, {p.role} at {p.company or 'the company'}, the interviewer. "
                "Thank the candidate warmly, say next steps will follow, and invite any "
                "questions. One or two sentences. Do not ask another interview question."
            )
        prompt = (
            f"Role being interviewed for: {job.title if job and job.title else 'the role'}\n"
            f"Candidate's last answer: {last_answer or '(none yet)'}\n"
            f"Next question to ask: {question or '(none — closing)'}\n\n"
            "Write your interviewer turn."
        )
        return self.llm.complete(prompt, system=system, max_tokens=160).strip()

    # -- summary ------------------------------------------------------------
    @staticmethod
    def _summarize(session: MockInterviewSession) -> MockInterviewSummary:
        fbs = [t.feedback for t in session.turns if t.feedback is not None]
        if not fbs:
            return MockInterviewSummary()

        def avg(attr: str) -> int:
            return round(sum(getattr(f, attr) for f in fbs) / len(fbs))

        # Aggregate the most common improvement themes.
        counts: dict[str, int] = {}
        strengths: dict[str, int] = {}
        for f in fbs:
            for imp in f.improvements:
                counts[imp] = counts.get(imp, 0) + 1
            for st in f.strengths:
                strengths[st] = strengths.get(st, 0) + 1
        top_improvements = [k for k, _ in sorted(counts.items(), key=lambda x: -x[1])[:3]]
        top_strengths = [k for k, _ in sorted(strengths.items(), key=lambda x: -x[1])[:3]]

        times = [
            t.response_seconds
            for t in session.turns
            if t.speaker == "candidate" and t.response_seconds is not None
        ]
        avg_time = round(sum(times) / len(times), 1) if times else None

        return MockInterviewSummary(
            overall=avg("overall"),
            structure=avg("structure"),
            specificity=avg("specificity"),
            conciseness=avg("conciseness"),
            confidence=avg("confidence"),
            answers_rated=len(fbs),
            avg_response_seconds=avg_time,
            top_strengths=top_strengths,
            top_improvements=top_improvements,
        )
