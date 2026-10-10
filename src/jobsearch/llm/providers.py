"""Concrete Anthropic / OpenAI providers.

Both import their SDK lazily so the base library installs without either vendor
package. Install the matching extra to use them::

    pip install .[anthropic]   # Claude text generation
    pip install .[openai]      # OpenAI text generation + embeddings
"""

from __future__ import annotations

import os
import threading
from typing import Callable, Sequence, TypeVar

import numpy as np

from jobsearch.llm.base import EmbeddingProvider, LLMProvider

_T = TypeVar("_T")
# Grace added to the SDK timeout for the hard wall-clock backstop: the SDK's own timeout
# should fire first, but it has proven unreliable in production (calls ran toward the
# ~600s default), so this guarantees the CALLER returns within ~timeout + grace.
_HARD_TIMEOUT_GRACE = 5.0

# Process-wide cap on concurrent LLM calls. On a slow provider a hard-timed-out call is
# abandoned but its thread keeps running until the socket read times out; without a cap
# those could pile up under load. Excess calls fail fast (-> deterministic fallback)
# instead of spawning unbounded work. Tunable via JOBSEARCH_LLM_MAX_INFLIGHT.
_MAX_INFLIGHT = max(1, int(os.getenv("JOBSEARCH_LLM_MAX_INFLIGHT", "8")))
_INFLIGHT = threading.BoundedSemaphore(_MAX_INFLIGHT)
_INFLIGHT_WAIT = 2.0  # brief wait for a free slot before giving up


def _run_with_deadline(fn: Callable[[], _T], timeout: float) -> _T:
    """Run ``fn()`` in a daemon thread and return its result, or raise ``TimeoutError``
    if it doesn't finish within ``timeout`` seconds. On timeout the thread is ABANDONED
    (it finishes on its own later, or dies with the process) -- the point is that the
    caller returns within ~timeout no matter what fn does internally (SDK/network hangs
    included), so a slow provider can never hang a request toward the SDK default.

    A process-wide semaphore caps concurrent in-flight calls: if no slot is free within
    a brief wait, raise immediately so the caller falls back deterministically rather than
    stacking more abandoned work. The slot is held until the real call finishes (even past
    a hard timeout), so sustained provider slowness degrades gracefully instead of
    exhausting threads/connections."""
    if not _INFLIGHT.acquire(timeout=_INFLIGHT_WAIT):
        raise RuntimeError(f"LLM concurrency cap ({_MAX_INFLIGHT}) reached; using fallback")
    box: dict[str, object] = {}
    done = threading.Event()

    def runner() -> None:
        try:
            box["value"] = fn()
        except BaseException as exc:  # noqa: BLE001 - re-raised in the caller thread
            box["error"] = exc
        finally:
            _INFLIGHT.release()  # free the slot only when the real call actually ends
            done.set()

    threading.Thread(target=runner, daemon=True).start()
    if not done.wait(timeout):
        raise TimeoutError(f"LLM call exceeded {timeout:.0f}s (hard timeout)")
    if "error" in box:
        raise box["error"]  # type: ignore[misc]
    return box["value"]  # type: ignore[return-value]


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
        def _call() -> str:
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

        # Hard wall-clock backstop around the SDK call (see OpenAI provider).
        return _run_with_deadline(_call, self._timeout + _HARD_TIMEOUT_GRACE)


class OpenAILLMProvider(LLMProvider):
    name = "openai"

    def __init__(
        self, api_key: str, model: str = "gpt-4o", *, timeout: float = 30.0, max_retries: int = 0
    ) -> None:
        try:
            import httpx
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on extra
            raise RuntimeError(
                "openai package not installed — run `pip install .[openai]`"
            ) from exc
        # A per-request timeout is essential: without it the SDK default is ~10 minutes,
        # so a slow OpenAI hangs every résumé-AI call until then. The SDK's own `timeout`
        # proved unreliable in production (calls ran toward the default), so we ALSO try an
        # explicit httpx client with GRANULAR timeouts (connect/read/write/pool) to enforce
        # the bound at the socket level -- a hung read then trips at ~timeout. This is
        # best-effort and wrapped in try/except so a differing httpx version can never crash
        # startup; the hard wall-clock wrapper + SDK timeout remain the guarantees.
        # max_retries defaults to 0 so a retry can't double the wait on a slow provider.
        client_kw: dict = {}
        try:
            client_kw["http_client"] = httpx.Client(
                timeout=httpx.Timeout(timeout, connect=min(10.0, timeout), pool=5.0)
            )
        except Exception:  # noqa: BLE001 - never let transport tuning break boot
            pass
        self._client = OpenAI(
            api_key=api_key, timeout=timeout, max_retries=max_retries, **client_kw
        )
        self._model = model
        self._timeout = timeout
        self._max_retries = max_retries

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

        def _call() -> str:
            resp = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""

        # Hard wall-clock backstop around the SDK call (the SDK timeout should fire
        # first, but has proven unreliable in production).
        return _run_with_deadline(_call, self._timeout + _HARD_TIMEOUT_GRACE)


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

    def __init__(
        self, api_key: str, model: str = "text-embedding-3-small", *,
        timeout: float = 30.0, max_retries: int = 0,
    ) -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on extra
            raise RuntimeError(
                "openai package not installed — run `pip install .[openai]`"
            ) from exc
        self._client = OpenAI(api_key=api_key, timeout=timeout, max_retries=max_retries)
        self._model = model
        self._timeout = timeout
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
