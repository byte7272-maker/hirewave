"""Real-embedding plumbing: batching in rank() + the caching wrapper.

Uses a counting fake embedder so we can assert *how the engine calls the
provider* without any network — the behaviors that matter for a real API:
one batched call per rank, and no repeat calls for cached text.
"""

from __future__ import annotations

import hashlib
from typing import Sequence

from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.matching.feedback import FeedbackSignal
from jobsearch.llm.base import EmbeddingProvider
from jobsearch.llm.cache import CachingEmbeddingProvider


class CountingEmbedder(EmbeddingProvider):
    """Deterministic per-text vectors; counts calls and total texts embedded."""

    name = "counting"

    def __init__(self, dim: int = 32) -> None:
        self.dim = dim
        self.calls = 0
        self.embedded = 0

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        self.calls += 1
        self.embedded += len(texts)
        out = []
        for t in texts:
            h = hashlib.md5(t.encode()).digest()
            out.append([b / 255.0 for b in (h * (self.dim // len(h) + 1))[: self.dim]])
        return out


# --- caching wrapper --------------------------------------------------------
def test_cache_dedupes_within_a_batch():
    inner = CountingEmbedder()
    cache = CachingEmbeddingProvider(inner)
    out = cache.embed(["a", "b", "a", "b", "a"])
    assert len(out) == 5
    assert out[0] == out[2] == out[4]  # same text -> same vector
    assert inner.embedded == 2  # only "a" and "b" reached the inner provider


def test_cache_reuses_across_calls():
    inner = CountingEmbedder()
    cache = CachingEmbeddingProvider(inner)
    cache.embed(["x", "y"])
    cache.embed(["y", "z"])  # only "z" is new
    assert inner.embedded == 3
    assert cache.cache_size == 3


def test_cache_lru_eviction():
    inner = CountingEmbedder()
    cache = CachingEmbeddingProvider(inner, max_entries=2)
    cache.embed(["a", "b"])
    cache.embed(["c"])  # evicts "a" (LRU)
    assert cache.cache_size == 2
    cache.embed(["a"])  # "a" must be recomputed
    assert inner.embedded == 4  # a, b, c, a


# --- batched ranking --------------------------------------------------------
def test_rank_embeds_in_one_batched_call(profile, matching_job, unrelated_job):
    embedder = CountingEmbedder()
    engine = MatchingEngine(embedder=embedder)
    engine.rank(profile, [matching_job, unrelated_job])
    # Exactly one embed() call: profile + 2 jobs = 3 texts in a single request.
    assert embedder.calls == 1
    assert embedder.embedded == 3


def test_rank_with_cache_avoids_recompute_on_rerank(profile, matching_job, unrelated_job):
    embedder = CountingEmbedder()
    engine = MatchingEngine(embedder=CachingEmbeddingProvider(embedder))
    r1 = engine.rank(profile, [matching_job, unrelated_job])
    engine.record_feedback(profile, r1[0], FeedbackSignal.APPLY)
    engine.rank(profile, [matching_job, unrelated_job])  # same texts
    # Second rank hits the cache entirely — inner embedder still saw only 3 texts.
    assert embedder.embedded == 3
