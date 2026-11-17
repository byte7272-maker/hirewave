"""Activity log — a structured record of what the user (and the assistant on their
behalf) did, so the assistant can answer "how many times…", "which résumés…", and
"what have I done lately…" in plain language.

This is distinct from :class:`Notification` (user-facing messages). An activity event
is a typed, countable action with a subject (which résumé/application/job) and a topic,
so it can be aggregated, filtered, and recited.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

#: The actions we record. Kept small and plain so counts read naturally
#: ("you tailored a résumé 4 times"). The past-tense phrasing is the recite form.
VERBS: dict[str, str] = {
    "created": "created",
    "edited": "edited",
    "tailored": "tailored",
    "reviewed": "reviewed",
    "versioned": "saved a new version of",
    "activated": "switched the active version of",
    "downloaded": "downloaded",
    "exported": "exported",
    "synced": "updated on a job site",
    "pinned": "pinned",
    "generated": "generated",
    "applied": "applied with",
    "uploaded": "uploaded",
    "deleted": "deleted",
}

#: Broad topics for relevance filtering ("recent résumé activity", "recent applications").
TOPICS: dict[str, str] = {
    "documents": "résumés & cover letters",
    "applications": "job applications",
    "matches": "job matches",
    "sync": "keeping documents current across sites",
    "interview": "interview practice",
    "search": "job searches",
    "research": "employer research",
}

#: The subject kinds an event can be about.
SUBJECTS = {"resume", "cover_letter", "application", "job", "board", "search", "interview"}

#: Default topic for a subject kind, used when a caller doesn't pass one.
_SUBJECT_TOPIC = {
    "resume": "documents",
    "cover_letter": "documents",
    "application": "applications",
    "job": "matches",
    "board": "sync",
    "search": "search",
    "interview": "interview",
}


def topic_for(subject_type: str, verb: str = "") -> str:
    """Resolve a sensible topic for an event from its subject (and verb)."""
    if verb == "synced" or verb == "pinned":
        return "sync"
    return _SUBJECT_TOPIC.get(subject_type, "documents")


class ActivityEvent(DomainModel):
    """One recorded action. Immutable once written."""

    id: str = Field(default_factory=lambda: new_id("act_"))
    user_id: str
    verb: str = "edited"              # a key in VERBS
    subject_type: str = "resume"     # a key in SUBJECTS
    subject_id: str = ""             # the résumé/application/… id this was about
    subject_label: str = ""          # human label, e.g. the résumé's role or filename
    topic: str = "documents"         # a key in TOPICS (relevance bucket)
    detail: str = ""                 # short qualifier, e.g. "to a job site", "v3"
    at: datetime = Field(default_factory=utcnow)
    meta: dict = Field(default_factory=dict)

    def phrase(self) -> str:
        """A one-line plain-language rendering, e.g. 'tailored résumé "Data Analyst"'."""
        v = VERBS.get(self.verb, self.verb)
        subj = self.subject_type.replace("_", " ")
        label = f' "{self.subject_label}"' if self.subject_label else ""
        tail = f" {self.detail}" if self.detail else ""
        return f"{v} {subj}{label}{tail}".strip()
