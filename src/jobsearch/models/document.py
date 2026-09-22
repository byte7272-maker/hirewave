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


class DocumentVersion(DomainModel):
    """One saved version of a résumé/cover letter, so the user can keep several
    tailored to different job types and switch between them. The document's active
    text always mirrors the active version."""

    version: int  # 1-based, monotonic
    label: str = ""  # short tag, e.g. the job type it targets ("Data Engineer")
    content: str = ""  # full text of this version
    change_summary: str = ""  # what changed vs the previous version
    source: str = "revision"  # "original" | "revision" | "tailored" | "reuse"
    instruction: str = ""  # the revise instruction, if any
    job_posting_id: str = ""  # the job this version was tailored for
    job_title: str = ""
    job_company: str = ""
    job_category: str = ""  # for suggesting reuse against a similar new job
    created_at: datetime = Field(default_factory=utcnow)


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
    rendered_text: str = ""  # human-readable rendering for review/export (= active version)
    file_url: str = ""  # populated once stored (upload) or exported to Drive
    original_filename: str = ""  # for uploaded files
    content_type: str = ""  # MIME type of the uploaded file
    ats_score: Optional[float] = None  # 0-100 keyword coverage estimate
    #: Cached document-quality grade (no target job) for list cards — set cheaply
    #: without an LLM, so the grade shows without firing a full review per item.
    quality_score: Optional[int] = None  # 0-100
    quality_grade: str = ""  # A | B | C | D
    #: Version history — several tailored variants the user can switch between.
    versions: list[DocumentVersion] = Field(default_factory=list)
    active_version: int = 0  # 0 = no explicit history yet (rendered_text is the doc)
    approved: bool = False  # human-in-the-loop gate
    archived: bool = False  # hidden from the main list, kept on the Archived shelf
    flagged: bool = False  # marked "needs attention" by the user
    created_at: datetime = Field(default_factory=utcnow)


class ResumeSuggestion(DomainModel):
    """One concrete suggested change to a résumé."""

    category: str  # "impact" | "keywords" | "clarity" | "length" | "structure"
    title: str
    detail: str
    severity: str = "suggestion"  # "critical" | "important" | "suggestion"


class QualityRating(DomainModel):
    """A résumé's rating on one recruiter quality standard, with a letter grade."""

    standard: str  # e.g. "Impact & results", "Keywords / ATS", "Structure"
    score: int = 0  # 0-100 on this standard
    grade: str = ""  # A | B | C | D
    note: str = ""  # one-line rationale


class ResumeReview(DomainModel):
    """An assessment of a résumé — a score, strengths, and suggested changes."""

    resume_id: str
    score: int = 0  # 0-100 overall strength
    grade: str = ""  # overall letter grade (A/B/C/D) derived from `score`
    summary: str = ""  # one-paragraph assessment (how good it is)
    content_summary: str = ""  # AI summary of what the résumé says (the candidate profile)
    ratings: list[QualityRating] = Field(default_factory=list)  # per-standard breakdown
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
    grade: str = ""  # overall letter grade (A/B/C/D) derived from `score`
    summary: str = ""  # one-paragraph assessment (how good it is)
    content_summary: str = ""  # AI summary of what the letter says
    ratings: list[QualityRating] = Field(default_factory=list)  # per-standard breakdown
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
    #: Cached document-quality grade (no target job) for list cards — see Resume.
    quality_score: Optional[int] = None  # 0-100
    quality_grade: str = ""  # A | B | C | D
    #: Version history — several tailored variants the user can switch between.
    versions: list[DocumentVersion] = Field(default_factory=list)
    active_version: int = 0  # 0 = no explicit history yet (content is the doc)
    approved: bool = False  # human-in-the-loop gate
    archived: bool = False  # hidden from the main list, kept on the Archived shelf
    flagged: bool = False  # marked "needs attention" by the user
    generated_at: datetime = Field(default_factory=utcnow)


class StoredDocument(DomainModel):
    """The raw bytes of an uploaded file, kept durably so they survive restarts.

    The document store's default tiers (in-memory, local filesystem) are lost when
    the container restarts on hosts with an ephemeral disk (e.g. Railway). Persisting
    the bytes here — base64 into the same JSON ``data`` column as every other
    entity — means an uploaded resume/cover-letter file is still downloadable, and
    its text still re-extractable, after a restart. Resume/cover-letter files are
    small, so base64 in a row is fine. Keyed by the owning document's id.
    """

    id: str  # the resume / cover-letter id this file belongs to
    content_type: str = ""
    data_b64: str = ""  # base64 of the raw file bytes
