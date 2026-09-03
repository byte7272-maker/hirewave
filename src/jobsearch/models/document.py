"""Generated documents: resumes and cover letters."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class ResumeFormat(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    MARKDOWN = "markdown"
    TXT = "txt"


class ResumeSource(str, Enum):
    GENERATED = "generated"  # produced by the generation engine
    UPLOADED = "uploaded"  # the user's own file


class ResumeContent(DomainModel):
    """Structured resume body (the ``generated_content`` JSON in the data model)."""

    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)  # rendered bullet blocks
    education: list[str] = Field(default_factory=list)
    keywords_injected: list[str] = Field(default_factory=list)


class Resume(DomainModel):
    id: str = Field(default_factory=lambda: new_id("res_"))
    user_id: str
    target_role: str = ""
    job_posting_id: Optional[str] = None
    version: int = 1
    format: ResumeFormat = ResumeFormat.MARKDOWN
    source: ResumeSource = ResumeSource.GENERATED
    tone: str = "professional"
    generated_content: ResumeContent = Field(default_factory=ResumeContent)
    rendered_text: str = ""  # human-readable rendering for review/export
    file_url: str = ""  # populated once stored (upload) or exported to Drive
    original_filename: str = ""  # for uploaded files
    content_type: str = ""  # MIME type of the uploaded file
    ats_score: Optional[float] = None  # 0-100 keyword coverage estimate
    approved: bool = False  # human-in-the-loop gate
    created_at: datetime = Field(default_factory=utcnow)


class ResumeSuggestion(DomainModel):
    """One concrete suggested change to a résumé."""

    category: str  # "impact" | "keywords" | "clarity" | "length" | "structure"
    title: str
    detail: str
    severity: str = "suggestion"  # "critical" | "important" | "suggestion"


class ResumeReview(DomainModel):
    """An assessment of a résumé — a score, strengths, and suggested changes."""

    resume_id: str
    score: int = 0  # 0-100 overall strength
    summary: str = ""  # one-paragraph assessment
    strengths: list[str] = Field(default_factory=list)
    suggestions: list[ResumeSuggestion] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)  # vs a target job
    word_count: int = 0


class ResumeRevision(DomainModel):
    """A prompt-controlled AI rewrite of a résumé — a *preview* to review before
    the user applies it (nothing is saved until they do)."""

    resume_id: str
    instruction: str
    preview: str = ""  # the revised résumé text


class CoverLetterReview(DomainModel):
    """An assessment of a cover letter — score, strengths, suggested changes."""

    cover_letter_id: str
    score: int = 0  # 0-100
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    suggestions: list[ResumeSuggestion] = Field(default_factory=list)
    word_count: int = 0


class CoverLetterRevision(DomainModel):
    """A prompt-controlled AI rewrite of a cover letter — a preview to review."""

    cover_letter_id: str
    instruction: str
    preview: str = ""


class CoverLetterSource(str, Enum):
    GENERATED = "generated"  # produced by the generation engine
    UPLOADED = "uploaded"  # the user's own file


class CoverLetter(DomainModel):
    id: str = Field(default_factory=lambda: new_id("cl_"))
    user_id: str
    #: Optional — a generated letter targets a job; an uploaded one may be generic.
    job_posting_id: Optional[str] = None
    resume_id: Optional[str] = None
    tone: str = "professional"
    source: CoverLetterSource = CoverLetterSource.GENERATED
    content: str = ""
    file_url: str = ""  # populated once an uploaded file is stored
    original_filename: str = ""  # for uploaded files
    content_type: str = ""  # MIME type of the uploaded file
    approved: bool = False  # human-in-the-loop gate
    generated_at: datetime = Field(default_factory=utcnow)
