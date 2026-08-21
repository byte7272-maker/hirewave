"""Permissioned automation assistant — consent scopes + an action audit log.

The assistant only ever acts on the user's behalf when the relevant scope is
granted (all off by default), never captures passwords/credentials, and records
every action so the user can see exactly what was done.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

#: The automations a user can opt into. Each is off until explicitly granted.
AUTOMATION_SCOPES = {
    "form_autofill": "Auto-fill application forms with my profile (I review before it submits)",
    "draft_prep": "Auto-prepare application drafts (résumé + cover letter) for strong matches",
    "submit_after_review": "Submit applications once I've reviewed and approved them",
}


class AutomationConsent(DomainModel):
    # Keyed by user_id (one consent record per user).
    user_id: str
    scopes: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=utcnow)


class AutomationAction(DomainModel):
    """An audit-log entry for something the assistant did/proposed."""

    id: str = Field(default_factory=lambda: new_id("aact_"))
    user_id: str
    kind: str  # "autofill" | "prepare" | "submit"
    job_id: Optional[str] = None
    status: str = "proposed"  # "proposed" | "completed" | "blocked" | "skipped"
    detail: str = ""
    created_at: datetime = Field(default_factory=utcnow)
