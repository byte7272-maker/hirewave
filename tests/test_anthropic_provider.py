"""Offline tests for the Anthropic provider request shape.

These run without a real API key by swapping in a fake client, so they verify
the *request we build* — crucially that we never send sampling parameters
(`temperature`/`top_p`/`top_k`), which return a 400 on Opus 4.8/4.7.
"""

from __future__ import annotations

import pytest

pytest.importorskip("anthropic")

from jobsearch.llm.providers import AnthropicLLMProvider  # noqa: E402


class _Block:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _Resp:
    def __init__(self, blocks) -> None:
        self.content = blocks


class _FakeMessages:
    def __init__(self, sink: dict) -> None:
        self._sink = sink

    def create(self, **kwargs):
        self._sink.update(kwargs)
        # Include a non-text block to prove we filter to text only.
        return _Resp([_Block("Tailored summary."), type("T", (), {"type": "thinking"})()])


class _FakeClient:
    def __init__(self, sink: dict) -> None:
        self.messages = _FakeMessages(sink)

    def with_options(self, **_kw):
        return self


def _provider_with_fake():
    # Explicit dummy key so construction never touches the network or env.
    prov = AnthropicLLMProvider(api_key="sk-ant-dummy", model="claude-opus-4-8")
    sink: dict = {}
    prov._client = _FakeClient(sink)
    return prov, sink


def test_does_not_send_sampling_params():
    prov, sink = _provider_with_fake()
    prov.complete("Write a summary.", system="You write summaries.", temperature=0.7, max_tokens=200)
    assert "temperature" not in sink
    assert "top_p" not in sink
    assert "top_k" not in sink


def test_sends_expected_fields():
    prov, sink = _provider_with_fake()
    prov.complete("Prompt body", system="Sys", max_tokens=321)
    assert sink["model"] == "claude-opus-4-8"
    assert sink["max_tokens"] == 321
    assert sink["system"] == "Sys"
    assert sink["messages"] == [{"role": "user", "content": "Prompt body"}]


def test_extracts_only_text_blocks():
    prov, sink = _provider_with_fake()
    out = prov.complete("x", system="y")
    assert out == "Tailored summary."  # thinking block ignored, stripped
