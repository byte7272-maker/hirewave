"""Concrete Anthropic / OpenAI providers.

Both import their SDK lazily so the base library installs without either vendor
package. Install the matching extra to use them::

    pip install .[anthropic]   # Claude text generation
    pip install .[openai]      # OpenAI text generation + embeddings
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from jobsearch.llm.base import EmbeddingProvider, LLMProvider


class AnthropicLLMProvider(LLMProvider):
    """Claude text generation via the official Anthropic SDK.

    Notes on the Opus-4.x request surface (see the claude-api reference):

    * ``temperature`` / ``top_p`` / ``top_k`` are **removed** on Opus 4.8/4.7 and
      return a 400 — this provider never sends them (the ``temperature`` kwarg on
      :meth:`complete` is accepted for interface parity but ignored here; steer
      output via the prompt instead).
    * Thinking is left off (the default) — résumé/cover-letter writing is a
      direct generation task, so we keep latency and token cost low. The prompts
      already instruct "final answer only".
    * ``api_key`` may be empty: the SDK then resolves ambient credentials
      (``ANTHROPIC_API_KEY`` env var, or an ``ant auth login`` profile).
    """

    name = "anthropic"

    def __init__(
        self, api_key: str = "", model: str = "claude-opus-4-8", *, timeout: float = 60.0
    ) -> None:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - depends on extra
            raise RuntimeError(
                "anthropic package not installed — run `pip install .[anthropic]`"
            ) from exc
        # Pass the key only when provided, so the SDK can fall back to ambient
        # credentials (env var / ant profile) when it is empty.
        self._client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
        self._anthropic = anthropic
        self._model = model
        self._timeout = timeout

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,  # accepted for parity, intentionally not sent
        max_tokens: int = 1500,
    ) -> str:
        try:
            resp = self._client.with_options(timeout=self._timeout).messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system or "",
                messages=[{"role": "user", "content": prompt}],
            )
        except self._anthropic.APIStatusError as exc:  # pragma: no cover - network
            raise RuntimeError(
                f"Anthropic API error ({exc.status_code}): {exc.message}"
            ) from exc

        # Concatenate only text blocks (ignore any thinking/other block types).
        return "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        ).strip()


class OpenAILLMProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on extra
            raise RuntimeError(
                "openai package not installed — run `pip install .[openai]`"
            ) from exc
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Semantic embeddings via OpenAI (default ``text-embedding-3-small``, 1536-d).

    Requests are chunked to stay within per-request input limits, empty strings
    are guarded (the API rejects them), and results are returned L2-normalized in
    the caller's order. Wrap this in
    :class:`jobsearch.llm.cache.CachingEmbeddingProvider` to avoid re-embedding
    unchanged text — the factory does this automatically.
    """

    name = "openai"
    _MAX_BATCH = 256  # inputs per request

    def __init__(self, api_key: str, model: str = "text-embedding-3-small") -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on extra
            raise RuntimeError(
                "openai package not installed — run `pip install .[openai]`"
            ) from exc
        self._client = OpenAI(api_key=api_key)
        self._model = model
        self.dim = 1536

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        # OpenAI rejects empty strings — substitute a single space.
        cleaned = [t if t.strip() else " " for t in texts]
        out: list[list[float]] = []
        for start in range(0, len(cleaned), self._MAX_BATCH):
            chunk = cleaned[start : start + self._MAX_BATCH]
            try:
                resp = self._client.embeddings.create(model=self._model, input=chunk)
            except Exception as exc:  # pragma: no cover - network
                raise RuntimeError(f"OpenAI embeddings error: {exc}") from exc
            # Return items in the order requested (guard against reordering).
            for item in sorted(resp.data, key=lambda d: d.index):
                vec = np.asarray(item.embedding, dtype=float)
                norm = np.linalg.norm(vec)
                out.append((vec / norm).tolist() if norm else vec.tolist())
        return out
