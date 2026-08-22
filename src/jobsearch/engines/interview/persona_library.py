"""User-directed interviewer personas.

Point ``JOBSEARCH_PERSONA_LIBRARY`` at a JSON file you own to replace the
built-in name/role generator with your *own* interviewers — e.g. your real
hiring panel, each mapped to a specific neural voice (``voice_id``) and/or a
talking-head clip (``video_url``). When no library is configured, the trainer
falls back to its deterministic generator, so nothing here is required.

File format — a JSON list of persona objects (all fields but ``name``/``role``
optional)::

    [
      {"name": "Maya Patel", "role": "Hiring Manager", "company": "Acme",
       "style": "friendly", "gender": "female", "voice": "warm",
       "voice_id": "elevenlabs:rachel", "avatar_url": "", "video_url": "",
       "bio": "Leads the design hiring loop at Acme."}
    ]
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from jobsearch.config import Settings, get_settings
from jobsearch.models.interview import (
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
)


def _initials(name: str) -> str:
    return "".join(p[0] for p in name.split()[:2]).upper() or "?"


def persona_id_for(name: str) -> str:
    """A *stable* id for a gallery/library persona, derived from its name, so the
    same persona keeps the same id across restarts and redeploys. This lets
    per-user settings (e.g. a chosen voice) key on the persona reliably."""
    return "persona_" + hashlib.md5(name.strip().lower().encode()).hexdigest()[:12]


def avatar_for(name: str, *, gender: str = "neutral") -> str:
    """A deterministic, free avatar image URL for a persona (DiceBear). The same
    name always yields the same face, so a persona looks consistent everywhere."""
    return f"https://api.dicebear.com/9.x/avataaars/svg?seed={quote(name)}"


# Built-in interviewer gallery — shown on the persona page when the user hasn't
# supplied their own JOBSEARCH_PERSONA_LIBRARY. A deliberate mix of difficulty
# (easy → hard) and style so the candidate can pick a warm-up or a grilling.
_DEFAULT_PERSONAS: list[dict] = [
    {"name": "Devon Clark", "role": "Recruiter", "style": "friendly",
     "difficulty": "easy", "gender": "male", "voice": "warm",
     "bio": "A friendly recruiter running a relaxed first-round screen — expect conversational, get-to-know-you questions with no pressure."},
    {"name": "Maya Patel", "role": "Hiring Manager", "style": "friendly",
     "difficulty": "easy", "gender": "female", "voice": "warm",
     "bio": "A warm, encouraging hiring manager who puts candidates at ease and focuses on your strengths and potential."},
    {"name": "Priya Nair", "role": "HR Director", "style": "formal",
     "difficulty": "normal", "gender": "female", "voice": "measured",
     "bio": "A structured HR director who runs a professional, by-the-book interview covering your background, motivations, and fit."},
    {"name": "Marcus Chen", "role": "Engineering Manager", "style": "behavioral",
     "difficulty": "normal", "gender": "male", "voice": "warm",
     "bio": "A behavioral interviewer who digs into your stories: how you collaborate, handle conflict, and lead through ambiguity."},
    {"name": "Dr. Elena Rossi", "role": "Technical Lead", "style": "technical",
     "difficulty": "hard", "gender": "female", "voice": "crisp",
     "bio": "A detail-oriented technical lead who probes deep into your decisions, trade-offs, and how things actually work under the hood."},
    {"name": "Jordan Blake", "role": "VP of Engineering", "style": "skeptical",
     "difficulty": "hard", "gender": "neutral", "voice": "firm",
     "bio": "A skeptical senior leader who presses for evidence, challenges your claims, and expects depth and composure under pressure."},
]


def default_personas() -> list[InterviewerPersona]:
    """The built-in interviewer gallery (with images, bios, and difficulty)."""
    return [p for p in (_to_persona(r) for r in _DEFAULT_PERSONAS) if p is not None]


def _to_persona(raw: dict) -> Optional[InterviewerPersona]:
    name = str(raw.get("name", "")).strip()
    role = str(raw.get("role", "")).strip()
    if not name or not role:
        return None
    try:
        style = InterviewerStyle(str(raw.get("style", "friendly")))
    except ValueError:
        style = InterviewerStyle.FRIENDLY
    gender = str(raw.get("gender", "neutral"))
    if gender not in {"female", "male", "neutral"}:
        gender = "neutral"
    try:
        difficulty = InterviewDifficulty(str(raw["difficulty"])) if raw.get("difficulty") else None
    except ValueError:
        difficulty = None
    return InterviewerPersona(
        # Stable, name-derived id unless the record pins one explicitly.
        id=str(raw.get("id", "")) or persona_id_for(name),
        name=name,
        role=role,
        company=str(raw.get("company", "")),
        style=style,
        difficulty=difficulty,
        bio=str(raw.get("bio", "")),
        initials=str(raw.get("initials", "")) or _initials(name),
        gender=gender,
        voice=str(raw.get("voice", "")),
        voice_id=str(raw.get("voice_id", "")),
        # Fall back to a generated avatar so every persona has an image.
        avatar_url=str(raw.get("avatar_url", "")) or avatar_for(name, gender=gender),
        video_url=str(raw.get("video_url", "")),
    )


class PersonaLibrary:
    """A resolvable collection of user-supplied interviewer personas."""

    def __init__(self, personas: Optional[list[InterviewerPersona]] = None) -> None:
        self._personas = personas or []

    # -- construction -------------------------------------------------------
    @classmethod
    def from_records(cls, records: list[dict]) -> "PersonaLibrary":
        return cls([p for p in (_to_persona(r) for r in records) if p is not None])

    @classmethod
    def from_path(cls, path: str) -> "PersonaLibrary":
        p = Path(path)
        if not p.exists():
            return cls([])
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls([])
        if not isinstance(data, list):
            return cls([])
        return cls.from_records([r for r in data if isinstance(r, dict)])

    @classmethod
    def from_settings(cls, settings: Optional[Settings] = None) -> "PersonaLibrary":
        """A user-supplied library when ``JOBSEARCH_PERSONA_LIBRARY`` is set,
        otherwise the built-in gallery (so the persona page is never empty)."""
        s = settings or get_settings()
        if s.persona_library_path:
            lib = cls.from_path(s.persona_library_path)
            if not lib.is_empty():
                return lib
        return cls(default_personas())

    # -- access -------------------------------------------------------------
    def is_empty(self) -> bool:
        return not self._personas

    def all(self) -> list[InterviewerPersona]:
        return list(self._personas)

    def resolve(self, *, style: InterviewerStyle, seed: str) -> Optional[InterviewerPersona]:
        """Pick a persona for ``style`` deterministically from ``seed``.

        Prefers personas whose style matches; otherwise draws from the whole
        library. Returns None only when the library is empty. A *copy* (fresh
        id) is returned so each session owns its persona instance.
        """
        if not self._personas:
            return None
        pool = [p for p in self._personas if p.style == style] or self._personas
        idx = int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(pool)
        return pool[idx].model_copy(deep=True)
