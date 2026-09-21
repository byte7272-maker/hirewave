"""The résumé/cover-letter AI model is independently configurable (cheapest default)."""

from __future__ import annotations

from jobsearch.config import Settings
from jobsearch.llm.factory import build_review_llm


def test_default_review_model_is_cheapest():
    assert Settings().review_model == "gpt-4o-mini"


def test_review_llm_uses_review_model_on_openai():
    s = Settings(llm_provider="openai", openai_api_key="sk-test")
    assert build_review_llm(s)._model == "gpt-4o-mini"  # cheapest by default
    s2 = Settings(llm_provider="openai", openai_api_key="sk-test", review_model="gpt-4o")
    assert build_review_llm(s2)._model == "gpt-4o"  # dialed up


def test_review_llm_falls_back_to_mock_without_provider():
    assert build_review_llm(Settings()).name == "mock"


def test_anthropic_ignores_openai_shaped_override_but_honors_claude():
    # The default review_model is an OpenAI id; on Anthropic it must not be passed
    # through, but a claude-* override is honored.
    s = Settings(llm_provider="anthropic", anthropic_api_key="x", anthropic_model="claude-opus-4-8")
    assert build_review_llm(s)._model == "claude-opus-4-8"
    s2 = Settings(llm_provider="anthropic", anthropic_api_key="x", review_model="claude-sonnet-5")
    assert build_review_llm(s2)._model == "claude-sonnet-5"
