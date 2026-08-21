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


class CoverLetter(DomainModel):
    id: str = Field(default_factory=lambda: new_id("cl_"))
    user_id: str
    job_posting_id: str
    resume_id: Optional[str] = None
    tone: str = "professional"
    content: str = ""
    approved: bool = False  # human-in-the-loop gate
    generated_at: datetime = Field(default_factory=utcnow)
