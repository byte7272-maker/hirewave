"""Abstract ports for text generation and embeddings."""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence

import numpy as np


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


class LLMProvider(ABC):
    """A text-completion provider."""

    #: Human-readable provider id, e.g. "anthropic", "openai", "mock".
    name: str = "abstract"

    @abstractmethod
    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> str:
        """Return a single completion string for *prompt*."""
        raise NotImplementedError


class EmbeddingProvider(ABC):
    """A text-embedding provider."""

    name: str = "abstract"
    dim: int = 512

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Return one L2-normalized vector per input text."""
        raise NotImplementedError

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity in ``[-1, 1]``; 0 if either vector is degenerate."""
    va, vb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0.0 or nb == 0.0:
        return 0.0
    sim = float(np.dot(va, vb) / (na * nb))
    if math.isnan(sim):
        return 0.0
    return max(-1.0, min(1.0, sim))
