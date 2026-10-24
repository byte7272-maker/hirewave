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


# Where the bundled persona photos are served from (the API's /static mount). Set
# JOBSEARCH_ASSET_BASE to override if the backend is reached at a different origin.
import os as _os

_ASSET_BASE = _os.environ.get(
    "JOBSEARCH_ASSET_BASE", "https://hirewave-production-3db3.up.railway.app"
).rstrip("/")


def _photo(slug: str) -> str:
    """Absolute URL of a bundled interviewer photo."""
    return f"{_ASSET_BASE}/static/personas/{slug}.webp"


def avatar_for(name: str, *, gender: str = "neutral") -> str:
    """A deterministic, free avatar image URL for a persona (DiceBear). The same
    name always yields the same face, so a persona looks consistent everywhere.
    This is the *fallback* — see :func:`resolve_avatar` for the realistic-image path."""
    return f"https://api.dicebear.com/9.x/avataaars/svg?seed={quote(name)}"


def resolve_avatar(
    name: str, *, gender: str = "neutral", explicit_url: str = "", persona_id: str = "",
    settings: Optional[Settings] = None,
) -> str:
    """The persona's avatar image, in priority order so illustrated avatars can be
    swapped for realistic ones without code changes:
      1. an explicit ``avatar_url`` on the persona record,
      2. a realistic image from ``JOBSEARCH_PERSONA_AVATARS`` (by name or id),
      3. the generated illustrated fallback.
    Point the env map at real photos/renders when you have them."""
    if explicit_url:
        return explicit_url
    try:
        overrides = (settings or get_settings()).persona_avatars or {}
    except Exception:  # noqa: BLE001 - never let avatar lookup break persona build
        overrides = {}
    return overrides.get(name) or overrides.get(persona_id) or avatar_for(name, gender=gender)


# Built-in interviewer gallery — shown on the persona page when the user hasn't
# supplied their own JOBSEARCH_PERSONA_LIBRARY. A deliberate mix of difficulty
# (easy → hard) and style so the candidate can pick a warm-up or a grilling.
# Per-role bio + style so the two interviewers of each role read consistently.
_RECRUITER = "A friendly recruiter running a relaxed first-round screen — expect conversational, get-to-know-you questions with no pressure."
_HM = "A warm, encouraging hiring manager who puts candidates at ease and focuses on your strengths and potential."
_HR = "A structured HR director who runs a professional, by-the-book interview covering your background, motivations, and fit."
_EM = "A behavioral interviewer who digs into your stories: how you collaborate, handle conflict, and lead through ambiguity."
_TL = "A detail-oriented technical lead who probes deep into your decisions, trade-offs, and how things actually work under the hood."
_VP = "A skeptical senior leader who presses for evidence, challenges your claims, and expects depth and composure under pressure."

# Gender matches each persona's PHOTO (so the voice, picked by gender, matches too).
_DEFAULT_PERSONAS: list[dict] = [
    {"name": "Devon Clark", "role": "Recruiter", "style": "friendly", "difficulty": "easy",
     "gender": "female", "voice": "warm", "bio": _RECRUITER, "avatar_url": _photo("devon_clark")},
    {"name": "Maya Patel", "role": "Hiring Manager", "style": "friendly", "difficulty": "easy",
     "gender": "female", "voice": "warm", "bio": _HM, "avatar_url": _photo("maya_patel")},
    {"name": "Priya Nair", "role": "HR Director", "style": "formal", "difficulty": "normal",
     "gender": "female", "voice": "measured", "bio": _HR, "avatar_url": _photo("priya_nair")},
    {"name": "Marcus Chen", "role": "Engineering Manager", "style": "behavioral", "difficulty": "normal",
     "gender": "male", "voice": "warm", "bio": _EM, "avatar_url": _photo("marcus_chen")},
    {"name": "Dr. Elena Rossi", "role": "Technical Lead", "style": "technical", "difficulty": "hard",
     "gender": "female", "voice": "crisp", "bio": _TL, "avatar_url": _photo("elena_rossi")},
    {"name": "Jordan Blake", "role": "VP of Engineering", "style": "skeptical", "difficulty": "hard",
     "gender": "female", "voice": "firm", "bio": _VP, "avatar_url": _photo("jordan_blake")},
    {"name": "Cam Reed", "role": "Recruiter", "style": "friendly", "difficulty": "easy",
     "gender": "female", "voice": "warm", "bio": _RECRUITER, "avatar_url": _photo("cam_reed")},
    {"name": "Lina Moreno", "role": "Hiring Manager", "style": "friendly", "difficulty": "easy",
     "gender": "female", "voice": "warm", "bio": _HM, "avatar_url": _photo("lina_moreno")},
    {"name": "Mia Torres", "role": "HR Director", "style": "formal", "difficulty": "normal",
     "gender": "female", "voice": "measured", "bio": _HR, "avatar_url": _photo("mia_torres")},
    {"name": "Jalen Mendez", "role": "Engineering Manager", "style": "behavioral", "difficulty": "normal",
     "gender": "male", "voice": "warm", "bio": _EM, "avatar_url": _photo("jalen_mendez")},
    {"name": "Ananya Desai", "role": "Technical Lead", "style": "technical", "difficulty": "hard",
     "gender": "female", "voice": "crisp", "bio": _TL, "avatar_url": _photo("ananya_desai")},
    {"name": "Kael Vance", "role": "VP of Engineering", "style": "skeptical", "difficulty": "hard",
     "gender": "male", "voice": "firm", "bio": _VP, "avatar_url": _photo("kael_vance")},
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
        # Realistic image when configured (JOBSEARCH_PERSONA_AVATARS), else generated.
        avatar_url=resolve_avatar(
            name, gender=gender, explicit_url=str(raw.get("avatar_url", "")),
            persona_id=str(raw.get("id", "")) or persona_id_for(name),
        ),
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
