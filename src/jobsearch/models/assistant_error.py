"""Assistant error log — a structured record of failures and undesirable events, with
when they happened and the plain-language cause/fix, so the assistant can acknowledge
them fast, recite a history, and never go silent.

Paired with the troubleshooting catalog (``engines/assistant/troubleshooting.py``),
which maps a failure to its cause + fix.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class AssistantError(DomainModel):
    """One recorded failure or undesirable event. Immutable once written."""

    id: str = Field(default_factory=lambda: new_id("err_"))
    user_id: str
    #: A troubleshooting key (e.g. "not_linked", "mic_unintelligible", "network").
    kind: str = "unknown"
    #: The raw error/detail (status text, exception message, or a short note).
    message: str = ""
    #: Where it happened — a section/action/route, for grouping and recall.
    context: str = ""
    #: Resolved at record time from the troubleshooting catalog.
    cause: str = ""   # plain-language why it happened
    fix: str = ""     # the actionable fix
    #: Whether this failure should be retried / the assistant should ask again.
    retry: bool = False
    ask_again: bool = False
    resolved: bool = False  # the user got past it (future: flip when the retry succeeds)
    at: datetime = Field(default_factory=utcnow)
    meta: dict = Field(default_factory=dict)
