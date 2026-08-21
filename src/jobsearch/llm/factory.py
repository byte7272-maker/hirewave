"""Build LLM / embedding providers from configuration."""

from __future__ import annotations

from jobsearch.config import Settings, get_settings
from jobsearch.llm.base import EmbeddingProvider, LLMProvider
from jobsearch.llm.mock import MockEmbeddingProvider, MockLLMProvider


def build_llm(settings: Settings | None = None) -> LLMProvider:
    """Return the configured text-generation provider (falls back to mock)."""
    s = settings or get_settings()
    provider = s.llm_provider

    # For Anthropic we don't require a JOBSEARCH-configured key — the SDK resolves
    # ambient credentials (ANTHROPIC_API_KEY env var, or an `ant auth login`
    # profile) when one isn't passed explicitly.
    if provider == "anthropic":
        from jobsearch.llm.providers import AnthropicLLMProvider

        return AnthropicLLMProvider(s.anthropic_api_key, s.anthropic_model)
    if provider == "openai" and s.openai_api_key:
        from jobsearch.llm.providers import OpenAILLMProvider

        return OpenAILLMProvider(s.openai_api_key, s.openai_model)
    return MockLLMProvider()


def build_embedder(settings: Settings | None = None) -> EmbeddingProvider:
    """Return the configured embedding provider (falls back to mock).

    Real providers are wrapped in an LRU cache so repeated embeddings of the
    same text (re-ranking, shared job postings) don't re-hit the API.
    """
    s = settings or get_settings()

    if s.embedding_provider == "openai" and s.openai_api_key:
        from jobsearch.llm.cache import CachingEmbeddingProvider
        from jobsearch.llm.providers import OpenAIEmbeddingProvider

        return CachingEmbeddingProvider(
            OpenAIEmbeddingProvider(s.openai_api_key, s.openai_embedding_model)
        )
    return MockEmbeddingProvider(dim=s.embedding_dim)
