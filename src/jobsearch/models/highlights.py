"""Persisted "My Work Highlights" runs.

Each time the editor generates reviewable bullets from a prompt/paste (suggest-edits,
highlights-suggest, or evidence-synthesize), the generated bullets AND the prompt that
produced them are saved as a :class:`HighlightsRun`, keyed by user + résumé. The
Documents editor can then show the **last result and its prompt by default** — no
re-running the AI — and offer the recent prompt history.

``items`` holds the bullets as the producing endpoint serialized them (edit suggestions
or evidence groups); ``mode`` says which, so the frontend renders each correctly.
``item_states`` remembers the user's per-item accept/reject so the review resumes where
they left off.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class HighlightsRun(DomainModel):
    id: str = Field(default_factory=lambda: new_id("hrun_"))
    user_id: str
    resume_id: str
    mode: str = ""            # "suggest" | "highlights" | "synthesize"
    prompt: str = ""          # the context/pasted text that produced these bullets
    job_posting_id: str = ""
    #: The generated bullets, serialized as the producing endpoint returned them
    #: (EditSuggestion dicts for suggest/highlights; EvidenceGroup dicts for synthesize).
    items: list[dict[str, Any]] = Field(default_factory=list)
    #: Per-item review state, keyed by the item's index as a string -> "accepted"|"rejected".
    item_states: dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
