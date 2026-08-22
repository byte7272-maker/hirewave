"""External work-experience highlights.

A store of narrative work highlights / stories / analyses the user brings in —
either self-written or produced by an AI agent inside *their own* work
environment (one with legitimate access to their work email, MS Teams, and other
work software that can surface past projects, interactions, and results the user
might not otherwise recall). The platform never touches those work tools or
credentials itself — the user's own work-environment agent produces the summary
and the user uploads or pastes the *output* here, then attests to it.

These highlights become extra, factual grounding for interview prep and mock
interviews (richer than a résumé's terse bullets), so suggested answers can draw
on real projects the candidate had forgotten.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class ExperienceSource(str, Enum):
    SELF_WRITTEN = "self_written"  # the user wrote it themselves
    #: Produced by an AI agent in the user's work environment (Copilot, Glean,
    #: a Teams/email assistant, etc.) that could see their real work history.
    AI_GENERATED = "ai_generated"
    IMPORTED = "imported"  # uploaded from a file the user provided


class ExperienceKind(str, Enum):
    HIGHLIGHT = "highlight"  # a concise accomplishment
    STORY = "story"  # a STAR-style narrative
    PROJECT = "project"  # a project write-up
    ANALYSIS = "analysis"  # analysis/reflection on work done
    INTERACTION = "interaction"  # a notable collaboration/stakeholder moment
    ACHIEVEMENT = "achievement"  # an award, metric, or recognized result


class ExperienceHighlight(DomainModel):
    """One narrative work-experience item the user brought in."""

    id: str = Field(default_factory=lambda: new_id("exp_"))
    user_id: str
    title: str = ""
    content: str = ""  # the highlight / story / analysis text
    kind: ExperienceKind = ExperienceKind.HIGHLIGHT
    source: ExperienceSource = ExperienceSource.SELF_WRITTEN
    #: Free-text label of the tool/agent that produced an AI-generated summary,
    #: e.g. "Microsoft 365 Copilot", "Glean", "Teams assistant". Empty when the
    #: user wrote it. Purely informational provenance — shown back to the user.
    source_tool: str = ""
    skills: list[str] = Field(default_factory=list)  # optional user tags
    company: str = ""  # where it happened (optional)
    period: str = ""  # e.g. "2023 Q3", "Jan 2022 - Jun 2023" (optional)
    #: The user attests this reflects their real work. We never fetch their work
    #: tools ourselves; this is always user-provided content.
    attested: bool = True
    original_filename: str = ""  # for uploaded items
    content_type: str = ""  # MIME type of an uploaded file
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
