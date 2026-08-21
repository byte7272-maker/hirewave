"""Heuristic rating of an interview answer — content *and* style.

Deterministic and transparent (no LLM needed), so ratings are fast, consistent,
and testable offline. Four dimensions on a 0-100 scale:

* **structure**  — does it have a clear arc (context → action → result / STAR)?
* **specificity** — concrete detail: numbers, metrics, named skills/tools?
* **conciseness** — a focused length, not too short and not rambling?
* **confidence**  — free of filler/hedging that undercuts authority?

Each dimension yields plain-language strengths and actionable improvements.
"""

from __future__ import annotations

import re
from typing import Sequence

from jobsearch.models import AnswerFeedback

_WORD = re.compile(r"[A-Za-z0-9'%$+.#-]+")
_RESULT = re.compile(
    r"\b(\d+%?|increased|reduced|improved|saved|grew|cut|boosted|led|delivered|"
    r"shipped|launched|resulted|achieved|drove|scaled)\b",
    re.I,
)
_NUMBER = re.compile(r"\b\d+(?:[.,]\d+)?%?\b")
_HEDGES = [
    "um", "uh", "like", "just", "maybe", "i think", "i guess", "sort of",
    "kind of", "probably", "hopefully", "basically", "actually", "you know",
]


def _clamp(v: float) -> int:
    return int(max(0, min(100, round(v))))


def rate_answer(text: str, *, skills: Sequence[str] = ()) -> AnswerFeedback:
    lowered = text.lower()
    words = _WORD.findall(text)
    wc = len(words)

    has_action = bool(re.search(r"\bi\s+\w+ed\b", lowered)) or " i " in f" {lowered} "
    has_result = bool(_RESULT.search(text))
    has_context = wc >= 25
    has_numbers = bool(_NUMBER.search(text))
    has_skill = any(s and s.lower() in lowered for s in skills)
    has_proper = bool(re.search(r"(?<!^)(?<![.!?]\s)\b[A-Z][a-zA-Z]{2,}\b", text))
    hedges = sum(lowered.count(h) for h in _HEDGES)

    structure = _clamp(40 + 20 * has_context + 20 * has_action + 20 * has_result)
    specificity = _clamp(30 + 25 * has_numbers + 25 * has_skill + 20 * has_proper)

    if wc < 15:
        conciseness = 45
    elif wc < 40:
        conciseness = 70
    elif wc <= 180:
        conciseness = 95
    elif wc <= 240:
        conciseness = 75
    else:
        conciseness = 55

    confidence = _clamp(95 - 9 * hedges - (15 if wc < 15 else 0))

    overall = _clamp(
        0.30 * structure + 0.25 * specificity + 0.20 * conciseness + 0.25 * confidence
    )

    strengths: list[str] = []
    if structure >= 80:
        strengths.append("Clear structure — sets context and lands on an outcome.")
    if specificity >= 80:
        strengths.append("Concrete and specific — good use of detail and metrics.")
    if conciseness >= 90:
        strengths.append("Well-paced length — focused without rambling.")
    if confidence >= 85:
        strengths.append("Confident delivery — little hedging or filler.")

    improvements: list[str] = []
    if not has_result:
        improvements.append("Close with a concrete result or metric so the impact lands.")
    if not has_numbers:
        improvements.append("Quantify where you can (numbers, %, scale, timeframe).")
    if not has_context and wc < 25:
        improvements.append("Set the scene first — a sentence of context (the STAR 'Situation').")
    if hedges >= 2:
        improvements.append(
            "Trim filler/hedging ('just', 'like', 'I think') to sound more decisive."
        )
    if wc > 220:
        improvements.append("Tighten to ~3-5 focused sentences; lead with the point.")
    if not improvements:
        improvements.append("Strong answer — vary examples so you're ready for follow-ups.")

    return AnswerFeedback(
        overall=overall,
        structure=structure,
        specificity=specificity,
        conciseness=conciseness,
        confidence=confidence,
        strengths=strengths,
        improvements=improvements,
    )
