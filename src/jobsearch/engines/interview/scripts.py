"""The fixed interviewer lines we pre-render as talking-head clips (one per persona).

These are the job-agnostic questions every interviewer asks — the common set — plus
a greeting and a closing. Each has a stable ``line_id`` so a clip can be cached and
looked up by (persona_id, line_id). Job/résumé-specific questions are not pre-rendered;
the client falls back to the persona photo + neural TTS for those.
"""

from __future__ import annotations

import re

# (line_id, spoken text). Order is the natural interview flow.
FIXED_LINES: list[tuple[str, str]] = [
    ("greeting", "Hi, thanks for joining me today. I'm looking forward to our conversation — let's get started."),
    ("intro", "To start, tell me about yourself and your background."),
    ("motivation", "What are you looking for in your next role?"),
    ("behavioral_project", "Tell me about a challenging project you worked on and how you approached it."),
    ("behavioral_conflict", "Describe a time you disagreed with a teammate or manager. How did you handle it?"),
    ("behavioral_failure", "Tell me about a time you failed or made a mistake, and what you learned."),
    ("probe", "Walk me through the specifics — what was the situation, what did you do, and what was the result?"),
    ("closing", "Finally, where do you see yourself professionally in a few years?"),
]

_BY_ID = dict(FIXED_LINES)
_TEXT_TO_ID = {}


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (text or "").lower()).strip()


# Map several spoken variants to the same line so the engine's wording still matches.
_ALIASES = {
    "intro": ["tell me about yourself", "tell me about yourself and your background"],
    "motivation": ["what are you looking for in your next role", "why are you interested"],
    "behavioral_project": ["challenging project you worked on"],
    "behavioral_conflict": ["disagreed with a teammate", "disagreed with a teammate or manager"],
    "behavioral_failure": ["time you failed", "failed or made a mistake"],
    "closing": ["where do you see yourself"],
}
for _lid, _text in FIXED_LINES:
    _TEXT_TO_ID[_norm(_text)] = _lid
for _lid, _variants in _ALIASES.items():
    for _v in _variants:
        _TEXT_TO_ID[_norm(_v)] = _lid


def known_line_ids() -> list[str]:
    """Every fixed line id, in interview order."""
    return [lid for lid, _ in FIXED_LINES]


def line_text(line_id: str) -> str:
    return _BY_ID.get(line_id, "")


def line_id_for_text(text: str) -> str:
    """The fixed line id a spoken question maps to (exact, alias, or substring), or ""
    when it's a dynamic/job-specific line that isn't pre-rendered."""
    n = _norm(text)
    if n in _TEXT_TO_ID:
        return _TEXT_TO_ID[n]
    for key, lid in _TEXT_TO_ID.items():
        if key and key in n:
            return lid
    return ""
