"""Dynamic knowledge base — runtime overrides for the assistant's instructions.

The assistant's scripts, troubleshooting fixes, and function descriptions ship as
static catalogs in code. This store lets any of them be **corrected or improved at
runtime** when something is proven more accurate, without a deploy: an override is
merged over the static entry it names.

Scope:
* ``"global"`` — applies to everyone (admin-gated; the curated knowledge base).
* a user id — a per-user override (that user's assistant only).
User-scoped overrides win over global; both win over the static catalog.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

#: The catalogs that can be overridden, and what ``key`` means in each.
CATEGORIES = {
    "troubleshooting",  # key = an error kind (e.g. "not_linked"); data merges over the entry
    "flow",             # key = a flow id (e.g. "tailor"); data merges over its speak/ask/focus
    "function",         # key = a function key (e.g. "sync"); data merges over title/blurb
    "faq",              # key = a FLOW_FAQ key; data = {"text": "…"}
}


class KnowledgeEntry(DomainModel):
    """One runtime override of a static catalog entry."""

    id: str = Field(default_factory=lambda: new_id("kb_"))
    scope: str = "global"            # "global" | a user_id
    category: str = "troubleshooting"  # one of CATEGORIES
    key: str = ""                    # the static entry this overrides/extends
    data: dict = Field(default_factory=dict)  # merged over the static entry (shallow)
    note: str = ""                   # provenance — WHY it's better/more accurate
    source: str = ""                 # who/what proposed it (user, feedback loop, …)
    active: bool = True              # inactive = ignored (soft-disable without deleting)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
