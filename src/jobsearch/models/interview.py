"""Interview-prep domain models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class QuestionCategory(str, Enum):
    INTRO = "intro"
    MOTIVATION = "motivation"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    EXPERIENCE = "experience"
    GAP = "gap"
    CLOSING = "closing"


class InterviewQuestion(DomainModel):
    id: str = Field(default_factory=lambda: new_id("iq_"))
    category: QuestionCategory = QuestionCategory.BEHAVIORAL
    question: str
    suggested_answer: str = ""
    tips: str = ""


class InterviewPrep(DomainModel):
    id: str = Field(default_factory=lambda: new_id("prep_"))
    user_id: str
    resume_id: Optional[str] = None
    job_posting_id: Optional[str] = None
    #: True when the answers were grounded in the résumé/document text (vs. the
    #: structured profile only).
    based_on_document: bool = False
    questions: list[InterviewQuestion] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utcnow)


# --- mock interview trainer -------------------------------------------------
class InterviewDifficulty(str, Enum):
    EASY = "easy"  # no follow-ups
    NORMAL = "normal"  # a probing follow-up on weak answers (challenging personas)
    HARD = "hard"  # presses harder, more follow-ups


class InterviewerStyle(str, Enum):
    FRIENDLY = "friendly"
    FORMAL = "formal"
    TECHNICAL = "technical"
    SKEPTICAL = "skeptical"
    BEHAVIORAL = "behavioral"


class InterviewerPersona(DomainModel):
    """An AI-generated interviewer with a name, role, and conversational style."""

    id: str = Field(default_factory=lambda: new_id("persona_"))
    name: str
    role: str
    company: str = ""
    style: InterviewerStyle = InterviewerStyle.FRIENDLY
    #: How tough this interviewer is — shown on the persona card so the user can
    #: pick easy vs. challenging. Also the default difficulty when a session
    #: starts with this persona (the request can still override it).
    difficulty: Optional[InterviewDifficulty] = None
    bio: str = ""
    initials: str = ""  # for a simple avatar chip
    #: Presentation hints so the client renders a consistent on-screen
    #: interviewer (animated avatar / video) and picks a matching natural voice.
    gender: str = "neutral"  # "female" | "male" | "neutral"
    voice: str = ""  # tone hint, e.g. "warm" | "measured" | "crisp" | "firm"
    #: Voice id for the configured neural-TTS source (e.g. an ElevenLabs voice).
    #: Empty ⇒ the client picks the best natural device voice for `gender`/`voice`.
    voice_id: str = ""
    #: Optional still portrait (user-directed persona libraries can supply one).
    avatar_url: str = ""
    #: Optional URL of a pre-rendered talking-head clip from a neural-video
    #: provider (D-ID / HeyGen). Empty ⇒ the client uses its animated avatar.
    video_url: str = ""


class VocabSuggestion(DomainModel):
    """One word/phrase worth changing, with stronger alternatives."""

    original: str
    kind: str  # "filler" | "weak" | "overused"
    count: int = 1
    suggestions: list[str] = Field(default_factory=list)
    note: str = ""


class VocabularyAnalysis(DomainModel):
    """Vocabulary analysis of a (recorded or live-transcribed) spoken answer."""

    word_count: int = 0
    unique_words: int = 0
    vocabulary_richness: float = 0.0  # 0-1, distinct content words / content words
    filler_count: int = 0
    filler_ratio: float = 0.0  # fillers / total words
    score: int = 0  # 0-100 overall vocabulary strength
    suggestions: list[VocabSuggestion] = Field(default_factory=list)
    polished: str = ""  # optional LLM rewrite applying the suggestions
    summary: str = ""  # one-line coaching takeaway


class AnswerFeedback(DomainModel):
    """Rating of a single candidate answer — content + style (0-100)."""

    overall: int = 0
    structure: int = 0  # STAR / clear arc
    specificity: int = 0  # concrete detail, metrics
    conciseness: int = 0  # right length, not rambling
    confidence: int = 0  # low filler / hedging
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


class SessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


class InterviewTurn(DomainModel):
    id: str = Field(default_factory=lambda: new_id("turn_"))
    speaker: Literal["interviewer", "candidate"]
    text: str
    question: str = ""  # the question an interviewer turn is asking
    feedback: Optional[AnswerFeedback] = None  # set on candidate turns
    response_seconds: Optional[float] = None  # time taken to answer (candidate turns)
    created_at: datetime = Field(default_factory=utcnow)


class MockInterviewSummary(DomainModel):
    overall: int = 0
    structure: int = 0
    specificity: int = 0
    conciseness: int = 0
    confidence: int = 0
    answers_rated: int = 0
    avg_response_seconds: Optional[float] = None
    top_strengths: list[str] = Field(default_factory=list)
    top_improvements: list[str] = Field(default_factory=list)


class MockInterviewSession(DomainModel):
    id: str = Field(default_factory=lambda: new_id("mock_"))
    user_id: str
    persona: InterviewerPersona
    resume_id: Optional[str] = None
    job_posting_id: Optional[str] = None
    status: SessionStatus = SessionStatus.ACTIVE
    difficulty: InterviewDifficulty = InterviewDifficulty.NORMAL
    plan: list[str] = Field(default_factory=list)  # planned questions (deterministic)
    asked: int = 0
    followups_this_q: int = 0  # probing follow-ups asked on the current question
    max_questions: int = 5
    turns: list[InterviewTurn] = Field(default_factory=list)
    summary: Optional[MockInterviewSummary] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CommunityQuestion(DomainModel):
    """A crowdsourced interview question submitted by a user for a job title.

    Anyone can submit questions for a role and upvote the ones they find useful;
    others search by job title to practise against real, community-sourced
    questions. ``job_title_key`` is the normalized title used for indexed lookup
    and search; ``voter_ids``/``flagged_by`` are internal and never returned to
    clients (the API exposes only counts + the caller's own vote/flag state).
    """

    id: str = Field(default_factory=lambda: new_id("cq_"))
    user_id: str  # submitter
    job_title: str  # as typed, e.g. "Senior Backend Engineer"
    job_title_key: str = ""  # normalized for search/index (lowercased, collapsed)
    category: QuestionCategory = QuestionCategory.BEHAVIORAL
    question: str
    tips: str = ""
    votes: int = 0  # net helpful votes
    voter_ids: list[str] = Field(default_factory=list)
    flags: int = 0
    flagged_by: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
