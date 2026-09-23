"""User, profile, and job-search preferences."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow

JobType = Literal["full_time", "part_time", "contract", "internship", "temporary"]


class SalaryRange(DomainModel):
    currency: str = "USD"
    minimum: Optional[int] = None
    maximum: Optional[int] = None


class WorkExperience(DomainModel):
    company: str
    title: str
    start: Optional[str] = None  # ISO date or free "2021" — kept flexible for import
    end: Optional[str] = None
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class Education(DomainModel):
    institution: str
    degree: str = ""
    field_of_study: str = ""
    graduation_year: Optional[int] = None


class JobPreferences(DomainModel):
    """Section 4: UserProfile.preferences."""

    job_type: Optional[JobType] = None
    salary_range: SalaryRange = Field(default_factory=SalaryRange)
    remote_ok: bool = True
    target_roles: list[str] = Field(default_factory=list)
    target_locations: list[str] = Field(default_factory=list)
    seniority: Optional[str] = None  # e.g. "junior", "mid", "senior", "staff"
    #: Broad job categories to focus matches on (empty = all categories).
    job_categories: list[str] = Field(default_factory=list)


class NarrationPrefs(DomainModel):
    """Read-aloud (text-to-speech) preferences for AI summaries and answers.

    Reading is OFF by default: a summary is spoken only when the user presses the
    play button, or turns on ``auto_play``. ``voice`` remembers their chosen voice
    (a server neural-voice id, or a browser speech-synthesis voice uri)."""

    auto_play: bool = False  # auto-read a summary/answer when it appears
    voice: str = ""  # remembered voice id/uri for the read-aloud switch


class RecentSearch(DomainModel):
    """A job title the user searched, remembered so the app can prefill and learn
    which roles they pursue (feeds title suggestions)."""

    role: str
    location: str = ""
    remote: Optional[bool] = None
    count: int = 1  # times this role was searched
    last_at: datetime = Field(default_factory=utcnow)


class RecentView(DomainModel):
    """One thing the user recently opened, for a global 'jump back in' rail.

    ``kind`` + ``ref_id`` identify the entity (so it can be deduped and reopened);
    ``title``/``subtitle`` are display text; ``view`` is the page name to route
    back to (e.g. "resumes", "matches")."""

    kind: str  # "resume" | "cover_letter" | "match" | "application" | ...
    ref_id: str  # the entity id
    title: str = ""
    subtitle: str = ""
    view: str = ""  # the page/view to route back to
    viewed_at: datetime = Field(default_factory=utcnow)


class UserProfile(DomainModel):
    """1:1 with User — the structured context feeding matching & generation."""

    user_id: str
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    work_experience: list[WorkExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    preferences: JobPreferences = Field(default_factory=JobPreferences)
    #: Recently searched roles (most-recent first, capped) — the app's memory of
    #: what the user looked for, so it can prefill and suggest adjacent titles.
    recent_searches: list[RecentSearch] = Field(default_factory=list)
    #: Read-aloud (TTS) preferences. Off by default; feeds the narration switch.
    narration: NarrationPrefs = Field(default_factory=NarrationPrefs)
    #: Per-view UI state so a page reopens where the user left it (selected item,
    #: active tab, filters, scroll anchor). Keyed by a short view name
    #: ("resumes", "matches", ...). Small, client-owned blobs; never fed to the LLM.
    view_state: dict[str, dict] = Field(default_factory=dict)
    #: Recently opened items across pages (most-recent first, capped) — powers a
    #: global "jump back in" rail on the dashboard.
    recently_viewed: list[RecentView] = Field(default_factory=list)

    def record_search(self, role: str, *, location: str = "", remote: Optional[bool] = None,
                      cap: int = 25) -> None:
        """Remember a searched role: dedupe by normalized role (bump its count and
        recency), move it to the front, and cap the list."""
        role = (role or "").strip()
        if not role:
            return
        key = role.lower()
        kept = [s for s in self.recent_searches if s.role.strip().lower() != key]
        prior = next((s for s in self.recent_searches if s.role.strip().lower() == key), None)
        entry = RecentSearch(
            role=role, location=location, remote=remote,
            count=(prior.count + 1) if prior else 1, last_at=utcnow(),
        )
        self.recent_searches = [entry, *kept][:cap]

    def record_view(self, kind: str, ref_id: str, *, title: str = "", subtitle: str = "",
                    view: str = "", cap: int = 20) -> None:
        """Remember an opened item for the jump-back-in rail: dedupe by
        (kind, ref_id), refresh its display text + recency, move it to the front,
        and cap the list."""
        kind, ref_id = (kind or "").strip(), (ref_id or "").strip()
        if not kind or not ref_id:
            return
        kept = [v for v in self.recently_viewed if not (v.kind == kind and v.ref_id == ref_id)]
        entry = RecentView(
            kind=kind, ref_id=ref_id, title=title, subtitle=subtitle,
            view=view, viewed_at=utcnow(),
        )
        self.recently_viewed = [entry, *kept][:cap]

    def to_context_text(self) -> str:
        """Flatten the profile into text for embedding / LLM prompts."""
        parts: list[str] = []
        if self.headline:
            parts.append(f"Headline: {self.headline}")
        if self.summary:
            parts.append(f"Summary: {self.summary}")
        if self.skills:
            parts.append("Skills: " + ", ".join(self.skills))
        for exp in self.work_experience:
            hl = ("; ".join(exp.highlights)) if exp.highlights else exp.summary
            parts.append(f"Experience: {exp.title} at {exp.company}. {hl}".strip())
        for edu in self.education:
            parts.append(f"Education: {edu.degree} {edu.field_of_study} — {edu.institution}".strip())
        if self.preferences.target_roles:
            parts.append("Target roles: " + ", ".join(self.preferences.target_roles))
        return "\n".join(p for p in parts if p)


class User(DomainModel):
    id: str = Field(default_factory=lambda: new_id("usr_"))
    email: str
    hashed_password: str = ""  # auth service owns hashing; engines never see plaintext
    #: Firebase Auth UID when the user signs in via Firebase (password stays with
    #: the provider — this app never sees it).
    firebase_uid: str = ""
    full_name: str = ""
    phone: str = ""  # used to fill application forms; never fabricated
    location: str = ""
    #: Unique token in the user's personal forwarding address
    #: (jobs+<token>@<inbox_domain>). Generated lazily on first use.
    inbox_token: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
