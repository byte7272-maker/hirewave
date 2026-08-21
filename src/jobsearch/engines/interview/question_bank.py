"""User-directed interview questions (dialog source).

Point ``JOBSEARCH_QUESTION_BANK`` at a JSON file you own to drive the mock
interview from *your* questions (e.g. a company's real loop) instead of the
built-in generator. When unset, the engine's résumé-grounded derivation is used.

File format — questions grouped by interviewer style (plus an optional
``"default"`` bucket used when a style has none)::

    {
      "technical": [
        {"category": "technical", "question": "Walk me through a system you designed."},
        {"category": "experience", "question": "What's the hardest bug you've shipped past?"}
      ],
      "default": [ {"category": "intro", "question": "Tell me about yourself."} ]
    }
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from jobsearch.config import Settings, get_settings
from jobsearch.models.interview import InterviewerStyle, InterviewQuestion, QuestionCategory


def _to_question(raw: dict) -> Optional[InterviewQuestion]:
    text = str(raw.get("question", "")).strip()
    if not text:
        return None
    try:
        category = QuestionCategory(str(raw.get("category", "behavioral")))
    except ValueError:
        category = QuestionCategory.BEHAVIORAL
    return InterviewQuestion(category=category, question=text, tips=str(raw.get("tips", "")))


class QuestionBank:
    """Style-keyed question sets supplied by the user."""

    def __init__(self, by_style: Optional[dict[str, list[InterviewQuestion]]] = None) -> None:
        self._by_style = by_style or {}

    @classmethod
    def from_records(cls, records: dict) -> "QuestionBank":
        by_style: dict[str, list[InterviewQuestion]] = {}
        for style, items in records.items():
            if not isinstance(items, list):
                continue
            qs = [q for q in (_to_question(r) for r in items if isinstance(r, dict)) if q]
            if qs:
                by_style[str(style)] = qs
        return cls(by_style)

    @classmethod
    def from_path(cls, path: str) -> "QuestionBank":
        p = Path(path)
        if not p.exists():
            return cls({})
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls({})
        return cls.from_records(data) if isinstance(data, dict) else cls({})

    @classmethod
    def from_settings(cls, settings: Optional[Settings] = None) -> "QuestionBank":
        s = settings or get_settings()
        return cls.from_path(s.question_bank_path) if s.question_bank_path else cls({})

    def is_empty(self) -> bool:
        return not self._by_style

    def questions_for(self, style: InterviewerStyle) -> list[InterviewQuestion]:
        """Questions for ``style``, falling back to the ``default`` bucket."""
        return list(self._by_style.get(style.value) or self._by_style.get("default") or [])
