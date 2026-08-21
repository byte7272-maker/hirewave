"""Provider-agnostic LLM & embedding ports.

The engines depend only on the :class:`LLMProvider` and :class:`EmbeddingProvider`
protocols. Concrete providers (Anthropic Claude, OpenAI, or deterministic mocks)
are chosen by :func:`jobsearch.llm.factory.build_llm` /
:func:`jobsearch.llm.factory.build_embedder` from configuration, so no engine is
hard-wired to a vendor.
"""

from jobsearch.llm.base import (
    ChatMessage,
    EmbeddingProvider,
    LLMProvider,
    cosine_similarity,
)
from jobsearch.llm.cache import CachingEmbeddingProvider
from jobsearch.llm.factory import build_embedder, build_llm

__all__ = [
    "CachingEmbeddingProvider",
    "ChatMessage",
    "EmbeddingProvider",
    "LLMProvider",
    "build_embedder",
    "build_llm",
    "cosine_similarity",
]
