"""Crowdsourced interview questions.

Users submit interview questions for a specific job title; everyone searches by
job type to find and practise against them, and upvotes the useful ones. Search
is a transparent keyword-relevance ranker (works fully offline, no embeddings
required): exact-title match first, then token overlap, tie-broken by helpful
votes and recency. Questions that accumulate flags are auto-hidden.
"""

from __future__ import annotations

import re
from typing import Optional

from jobsearch.models import CommunityQuestion, InterviewQuestion, QuestionCategory
from jobsearch.store import InMemoryRepository, Repository

# Tiny stopword set so "Senior Backend Engineer" and "Backend Engineer, Senior"
# still overlap strongly without matching on filler words.
_STOP = {"a", "an", "the", "of", "and", "or", "for", "to", "in", "at", "with"}
_FLAG_HIDE_THRESHOLD = 3


def normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


def _tokens(title: str) -> set[str]:
    raw = re.split(r"[^a-z0-9+#]+", normalize_title(title))
    return {t for t in raw if len(t) >= 2 and t not in _STOP}


class CommunityQuestionEngine:
    """Submit / search / upvote crowdsourced questions for job titles."""

    def __init__(self, repo: Optional[Repository[CommunityQuestion]] = None) -> None:
        self.repo = repo or InMemoryRepository(id_attr="id")

    # -- submit -------------------------------------------------------------
    def submit(
        self,
        *,
        user_id: str,
        job_title: str,
        question: str,
        category: QuestionCategory = QuestionCategory.BEHAVIORAL,
        tips: str = "",
    ) -> CommunityQuestion:
        title = (job_title or "").strip()
        text = (question or "").strip()
        if not title:
            raise ValueError("job_title is required")
        if len(text) < 8:
            raise ValueError("question is too short")
        key = normalize_title(title)

        # De-dupe: an identical question for the same title is merged, not
        # duplicated, so popular questions accumulate votes instead of clones.
        norm_text = re.sub(r"\s+", " ", text.lower()).rstrip("?. ")
        for existing in self.repo.find(job_title_key=key):
            if re.sub(r"\s+", " ", existing.question.lower()).rstrip("?. ") == norm_text:
                return existing

        cq = CommunityQuestion(
            user_id=user_id,
            job_title=title,
            job_title_key=key,
            category=category,
            question=text,
            tips=tips.strip(),
        )
        return self.repo.add(cq)

    # -- search -------------------------------------------------------------
    def _relevance(self, query_tokens: set[str], q: CommunityQuestion, query_key: str) -> float:
        if query_key and q.job_title_key == query_key:
            return 1.0  # exact title match
        if not query_tokens:
            return 0.1  # browse mode — everything is weakly relevant
        cand = _tokens(q.job_title)
        if not cand:
            return 0.0
        overlap = len(query_tokens & cand)
        if overlap == 0:
            return 0.0
        # Coverage of the query + a bonus for covering the candidate title too.
        return 0.7 * (overlap / len(query_tokens)) + 0.3 * (overlap / len(cand))

    def search(
        self,
        job_title: str,
        *,
        category: Optional[QuestionCategory] = None,
        limit: int = 20,
    ) -> list[CommunityQuestion]:
        query_key = normalize_title(job_title)
        query_tokens = _tokens(job_title)
        scored: list[tuple[float, int, float, CommunityQuestion]] = []
        for q in self.repo.all():
            if q.flags >= _FLAG_HIDE_THRESHOLD:
                continue
            if category is not None and q.category != category:
                continue
            rel = self._relevance(query_tokens, q, query_key)
            if rel <= 0:
                continue
            scored.append((rel, q.votes, q.created_at.timestamp(), q))
        # Rank: relevance, then helpful votes, then recency.
        scored.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)
        return [q for _, _, _, q in scored[: max(1, limit)]]

    def titles(self, limit: int = 50) -> list[dict]:
        """Distinct job titles that have questions, with counts (for suggestions)."""
        counts: dict[str, dict] = {}
        for q in self.repo.all():
            if q.flags >= _FLAG_HIDE_THRESHOLD:
                continue
            entry = counts.setdefault(q.job_title_key, {"job_title": q.job_title, "count": 0})
            entry["count"] += 1
        ordered = sorted(counts.values(), key=lambda e: e["count"], reverse=True)
        return ordered[:limit]

    # -- engagement ---------------------------------------------------------
    def vote(self, question_id: str, user_id: str) -> Optional[CommunityQuestion]:
        """Toggle a helpful upvote (one per user)."""
        q = self.repo.get(question_id)
        if q is None:
            return None
        if user_id in q.voter_ids:
            q.voter_ids.remove(user_id)
        else:
            q.voter_ids.append(user_id)
        q.votes = len(q.voter_ids)
        return self.repo.add(q)

    def flag(self, question_id: str, user_id: str) -> Optional[CommunityQuestion]:
        q = self.repo.get(question_id)
        if q is None:
            return None
        if user_id not in q.flagged_by:
            q.flagged_by.append(user_id)
            q.flags = len(q.flagged_by)
            self.repo.add(q)
        return q

    def for_user(self, user_id: str) -> list[CommunityQuestion]:
        return sorted(self.repo.find(user_id=user_id), key=lambda q: q.created_at, reverse=True)

    # -- interview integration ---------------------------------------------
    def questions_for_interview(self, job_title: str, *, limit: int = 6) -> list[InterviewQuestion]:
        """Top community questions for a title as an interview plan."""
        return [
            InterviewQuestion(category=q.category, question=q.question, tips=q.tips)
            for q in self.search(job_title, limit=limit)
        ]
