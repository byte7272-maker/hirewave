"""MatchingEngine — rank job postings for a user profile."""

from __future__ import annotations

from typing import Optional, Sequence

from jobsearch.engines.matching.feedback import FeedbackSignal, FeedbackStore
from jobsearch.engines.matching.scoring import (
    MatchBreakdown,
    MatchResult,
    MatchWeights,
    location_fit,
    recency_fit,
    salary_fit,
    seniority_fit,
    skills_fit,
)
from jobsearch.llm import EmbeddingProvider, build_embedder, cosine_similarity
from jobsearch.models import JobPosting, UserProfile


class MatchingEngine:
    def __init__(
        self,
        *,
        embedder: Optional[EmbeddingProvider] = None,
        weights: Optional[MatchWeights] = None,
        feedback: Optional[FeedbackStore] = None,
    ) -> None:
        self.embedder = embedder or build_embedder()
        self.default_weights = weights or MatchWeights()
        self.feedback = feedback or FeedbackStore(self.default_weights)

    def score(
        self,
        profile: UserProfile,
        job: JobPosting,
        *,
        profile_vec: Optional[list[float]] = None,
        job_vec: Optional[list[float]] = None,
    ) -> MatchResult:
        """Score a single job for the profile, returning a full breakdown.

        ``profile_vec`` / ``job_vec`` let callers pass pre-computed embeddings so
        ranking a batch doesn't re-embed the profile or issue one API call per
        job (see :meth:`rank`).
        """
        pv = profile_vec if profile_vec is not None else self.embedder.embed_one(
            profile.to_context_text()
        )
        jv = job_vec if job_vec is not None else self.embedder.embed_one(
            job.to_matching_text()
        )
        semantic = (cosine_similarity(pv, jv) + 1.0) / 2.0  # map [-1,1] -> [0,1]

        skills, matching, gaps = skills_fit(profile, job)
        breakdown = MatchBreakdown(
            semantic=semantic,
            skills=skills,
            location=location_fit(profile, job),
            salary=salary_fit(profile, job),
            seniority=seniority_fit(profile, job),
            recency=recency_fit(job),
        )
        weights = self.feedback.weights_for(profile.user_id)
        composite = breakdown.composite(weights)
        return MatchResult(
            job=job,
            score=composite,
            breakdown=breakdown,
            matching_skills=matching,
            gap_skills=gaps,
        )

    def rank(
        self,
        profile: UserProfile,
        jobs: Sequence[JobPosting],
        *,
        limit: Optional[int] = None,
        min_score: float = 0.0,
    ) -> list[MatchResult]:
        """Return jobs ranked by descending match score.

        The profile is embedded once and **all job texts are embedded in a
        single batched call** — with a real embedding API that's one request
        instead of N. Each returned job's ``match_score`` is also stamped onto
        the posting for convenience.
        """
        if not jobs:
            return []
        # One batched embedding call: profile first, then every job.
        texts = [profile.to_context_text()] + [j.to_matching_text() for j in jobs]
        vectors = self.embedder.embed(texts)
        profile_vec, job_vecs = vectors[0], vectors[1:]
        results = [
            self.score(profile, job, profile_vec=profile_vec, job_vec=jv)
            for job, jv in zip(jobs, job_vecs)
        ]
        results.sort(key=lambda r: r.score, reverse=True)
        results = [r for r in results if r.score >= min_score]
        if limit is not None:
            results = results[:limit]
        for r in results:
            r.job.match_score = r.score
        return results

    def record_feedback(
        self, profile: UserProfile, result: MatchResult, signal: FeedbackSignal
    ) -> MatchWeights:
        """Apply a user signal (save/apply/dismiss) to adapt future ranking."""
        return self.feedback.record(profile.user_id, result.breakdown, signal)
