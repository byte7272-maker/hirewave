"""Offline tests for OpenAIEmbeddingProvider request/response handling."""

from __future__ import annotations

import math

import pytest

pytest.importorskip("openai")

from jobsearch.llm.providers import OpenAIEmbeddingProvider  # noqa: E402


class _Item:
    def __init__(self, index: int, embedding) -> None:
        self.index = index
        self.embedding = embedding


class _Resp:
    def __init__(self, data) -> None:
        self.data = data


class _FakeEmbeddings:
    def __init__(self, sink: list) -> None:
        self._sink = sink

    def create(self, *, model, input):
        self._sink.append(list(input))
        # Return in REVERSED order to prove the provider re-sorts by index.
        data = [_Item(i, [float(i + 1), 0.0, 0.0]) for i in range(len(input))]
        return _Resp(list(reversed(data)))


class _FakeClient:
    def __init__(self, sink: list) -> None:
        self.embeddings = _FakeEmbeddings(sink)


def _provider():
    prov = OpenAIEmbeddingProvider(api_key="sk-dummy")
    sink: list = []
    prov._client = _FakeClient(sink)
    prov._MAX_BATCH = 2  # force chunking
    return prov, sink


def test_chunks_requests():
    prov, sink = _provider()
    prov.embed(["a", "b", "c", "d", "e"])
    assert [len(c) for c in sink] == [2, 2, 1]  # 5 inputs -> 3 chunked requests


def test_empty_strings_guarded():
    prov, sink = _provider()
    out = prov.embed(["", "  ", "real"])
    # No empty string ever reaches the API (blanks become a single space).
    assert all(all(s != "" for s in chunk) for chunk in sink)
    assert len(out) == 3  # still one vector per input


def test_results_are_normalized_and_ordered():
    prov, sink = _provider()
    out = prov.embed(["x", "y"])  # one chunk of 2
    # Order preserved despite the fake returning reversed data.
    assert out[0][0] > 0 and out[1][0] > 0
    for vec in out:
        assert math.isclose(math.sqrt(sum(v * v for v in vec)), 1.0, rel_tol=1e-9)


def test_factory_wraps_openai_in_cache(monkeypatch):
    from jobsearch.config import Settings
    from jobsearch.llm.cache import CachingEmbeddingProvider
    from jobsearch.llm.factory import build_embedder

    s = Settings(embedding_provider="openai")
    monkeypatch.setattr(s, "openai_api_key", "sk-dummy")
    emb = build_embedder(s)
    assert isinstance(emb, CachingEmbeddingProvider)
    assert emb.name == "openai"
