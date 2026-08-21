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

from jobsearch.config import Settings, get_settings
from jobsearch.models.interview import InterviewerPersona, InterviewerStyle


def _initials(name: str) -> str:
    return "".join(p[0] for p in name.split()[:2]).upper() or "?"


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
    return InterviewerPersona(
        name=name,
        role=role,
        company=str(raw.get("company", "")),
        style=style,
        bio=str(raw.get("bio", "")),
        initials=str(raw.get("initials", "")) or _initials(name),
        gender=gender,
        voice=str(raw.get("voice", "")),
        voice_id=str(raw.get("voice_id", "")),
        avatar_url=str(raw.get("avatar_url", "")),
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
        s = settings or get_settings()
        return cls.from_path(s.persona_library_path) if s.persona_library_path else cls([])

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
