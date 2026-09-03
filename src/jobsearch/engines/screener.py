"""ScreenerMemory — learn and recall answers to application screener questions.

Deterministic, offline, no LLM. Questions are normalized to a key (lowercased,
punctuation stripped, filler words removed) and matched exactly first, then by
token overlap so slight rewordings resolve to the same saved answer. New
questions are learned on ``learn``; unknown questions return no suggestion so the
caller can ask the user, then save it for next time.
"""

from __future__ import annotations

import re
from typing import Optional

from jobsearch.models import ScreenerAnswer
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository

# Filler words that don't help identify a question.
_STOP = {
    "a", "an", "the", "of", "do", "does", "you", "your", "have", "has", "are", "is",
    "in", "to", "for", "with", "how", "many", "much", "currently", "please", "any",
    "at", "on", "this", "that", "we", "our", "will", "would", "can", "could", "and",
    "or", "if", "as", "be", "been", "us",  # keep domain words like "license", "years"
}
_WORD_RE = re.compile(r"[a-z0-9+#]+")
#: Below this token-overlap ratio a saved question is not considered a match.
_MATCH_THRESHOLD = 0.6
_BOOL_TRUE = {"yes", "y", "true", "authorized", "eligible"}
_BOOL_FALSE = {"no", "n", "false"}


def normalize(question: str) -> str:
    toks = [t for t in _WORD_RE.findall((question or "").lower()) if t not in _STOP]
    return " ".join(toks)


def _tokens(question: str) -> set[str]:
    return set(normalize(question).split())


def infer_kind(answer: str) -> str:
    a = (answer or "").strip().lower()
    if a in _BOOL_TRUE or a in _BOOL_FALSE:
        return "boolean"
    if re.fullmatch(r"-?\d+(\.\d+)?", a):
        return "numeric"
    return "text"


class ScreenerMemory:
    def __init__(self, repo: Optional[Repository[ScreenerAnswer]] = None) -> None:
        self.repo = repo or InMemoryRepository(id_attr="id")

    # -- recall -------------------------------------------------------------
    def _match(self, user_id: str, question: str) -> tuple[Optional[ScreenerAnswer], float]:
        key = normalize(question)
        saved = self.repo.find(user_id=user_id)
        if not saved:
            return None, 0.0
        # Exact normalized match wins.
        for s in saved:
            if s.question_key == key and key:
                return s, 1.0
        # Otherwise best token-overlap (Jaccard) above the threshold.
        qt = _tokens(question)
        if not qt:
            return None, 0.0
        best, best_score = None, 0.0
        for s in saved:
            st = set(s.question_key.split())
            if not st:
                continue
            score = len(qt & st) / len(qt | st)
            if score > best_score:
                best, best_score = s, score
        if best is not None and best_score >= _MATCH_THRESHOLD:
            return best, round(best_score, 2)
        return None, 0.0

    def suggest(self, user_id: str, question: str) -> Optional[dict]:
        """Best saved answer for a question, or None. Does not mutate."""
        s, conf = self._match(user_id, question)
        if s is None:
            return None
        return {
            "id": s.id, "question": question, "answer": s.answer, "kind": s.kind,
            "matched_question": s.question, "confidence": conf,
        }

    def suggest_many(self, user_id: str, questions: list[str]) -> list[dict]:
        """Prefill a whole form: one row per question, with an answer when known
        and ``answer=None`` (needs the user) when not."""
        out = []
        for q in questions:
            hit = self.suggest(user_id, q)
            out.append(hit or {"question": q, "answer": None, "confidence": 0.0})
        return out

    def mark_used(self, answer_id: str) -> None:
        s = self.repo.get(answer_id)
        if s is not None:
            s.times_used += 1
            self.repo.add(s)

    # -- learn --------------------------------------------------------------
    def learn(self, user_id: str, question: str, answer: str, *, kind: str = "") -> ScreenerAnswer:
        """Save (or update) the answer to a question. Upserts by normalized key so
        re-answering an existing question overwrites it rather than duplicating."""
        question = (question or "").strip()
        answer = (answer or "").strip()
        if not question:
            raise ValueError("question is required")
        if not answer:
            raise ValueError("answer is required")
        key = normalize(question)
        existing = next(
            (s for s in self.repo.find(user_id=user_id) if s.question_key == key and key), None
        )
        if existing is not None:
            existing.question = question
            existing.answer = answer
            existing.kind = kind or infer_kind(answer)
            existing.updated_at = utcnow()
            return self.repo.add(existing)
        item = ScreenerAnswer(
            user_id=user_id, question=question, question_key=key,
            answer=answer, kind=kind or infer_kind(answer),
        )
        return self.repo.add(item)

    def learn_many(self, user_id: str, pairs: list[dict]) -> list[ScreenerAnswer]:
        """Learn a batch of {question, answer, kind?} — e.g. after a submitted form."""
        out = []
        for p in pairs:
            try:
                out.append(self.learn(user_id, p.get("question", ""), p.get("answer", ""),
                                      kind=p.get("kind", "")))
            except ValueError:
                continue  # skip blanks
        return out

    # -- manage -------------------------------------------------------------
    def list_for(self, user_id: str) -> list[ScreenerAnswer]:
        return sorted(self.repo.find(user_id=user_id), key=lambda s: s.updated_at, reverse=True)

    def get_owned(self, answer_id: str, user_id: str) -> Optional[ScreenerAnswer]:
        s = self.repo.get(answer_id)
        return s if s and s.user_id == user_id else None

    def update(self, item: ScreenerAnswer, *, answer: Optional[str] = None,
               kind: Optional[str] = None) -> ScreenerAnswer:
        if answer is not None:
            item.answer = answer.strip()
            if kind is None:
                item.kind = infer_kind(item.answer)
        if kind is not None:
            item.kind = kind
        item.updated_at = utcnow()
        return self.repo.add(item)

    def delete(self, answer_id: str) -> None:
        self.repo.delete(answer_id)
