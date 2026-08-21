"""An embedding cache wrapper.

Wraps any :class:`EmbeddingProvider` and memoizes vectors by input text, so
repeated embeddings of the same profile/job (e.g. re-ranking after a feedback
signal, or the same job appearing in many users' candidate sets) don't re-hit
the underlying API. On a batch it only forwards the cache-missing, de-duplicated
texts to the inner provider.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Sequence

from jobsearch.llm.base import EmbeddingProvider


class CachingEmbeddingProvider(EmbeddingProvider):
    def __init__(self, inner: EmbeddingProvider, *, max_entries: int = 50_000) -> None:
        self._inner = inner
        self.name = inner.name
        self.dim = inner.dim
        self._max = max_entries
        self._cache: "OrderedDict[str, list[float]]" = OrderedDict()

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        # Which distinct texts are not cached yet?
        missing: list[str] = []
        seen: set[str] = set()
        for t in texts:
            if t not in self._cache and t not in seen:
                seen.add(t)
                missing.append(t)

        if missing:
            fresh = self._inner.embed(missing)
            for text, vec in zip(missing, fresh):
                self._store(text, vec)

        # LRU touch + return in the caller's order.
        out: list[list[float]] = []
        for t in texts:
            vec = self._cache[t]
            self._cache.move_to_end(t)
            out.append(vec)
        return out

    def _store(self, text: str, vec: list[float]) -> None:
        self._cache[text] = vec
        self._cache.move_to_end(text)
        while len(self._cache) > self._max:
            self._cache.popitem(last=False)  # evict least-recently-used

    @property
    def cache_size(self) -> int:
        return len(self._cache)
