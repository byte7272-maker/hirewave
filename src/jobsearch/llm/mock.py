"""Deterministic offline providers — no network, no API key.

These let every engine run and be unit-tested without credentials. The mock
embedder produces a hashed bag-of-words vector (so semantically overlapping
texts really do score higher), and the mock LLM fills templates from labeled
fields the generation engine supplies (``Role:``, ``Company:`` ...), yielding
coherent-but-generic prose.
"""

from __future__ import annotations

import hashlib
import re
from typing import Sequence

import numpy as np

from jobsearch.llm.base import EmbeddingProvider, LLMProvider

_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#.]{1,}")


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class MockEmbeddingProvider(EmbeddingProvider):
    """Hashed bag-of-words embeddings — deterministic and dependency-free."""

    name = "mock"

    def __init__(self, dim: int = 512) -> None:
        self.dim = dim

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = np.zeros(self.dim, dtype=float)
            for tok in _tokenize(text):
                h = int.from_bytes(hashlib.md5(tok.encode()).digest()[:8], "big")
                idx = h % self.dim
                sign = 1.0 if (h >> 63) & 1 else -1.0
                vec[idx] += sign
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec /= norm
            out.append(vec.tolist())
        return out


class MockLLMProvider(LLMProvider):
    """Template-filling stand-in for a real chat model."""

    name = "mock"

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> str:
        fields = self._parse_fields(prompt)
        role = fields.get("role", "the role")
        company = fields.get("company", "your organization")
        candidate = fields.get("candidate", "The candidate")
        skills = fields.get("top skills", "")
        task = (system or "").lower() + " " + prompt.lower()
        sys_l = (system or "").lower()

        if "bio for a fictional job interviewer" in sys_l:
            return f"A seasoned {role} known for {skills or 'a fair, thorough interview'}."

        if "interviewer" in sys_l or "conducting a job interview" in sys_l:
            question = ""
            for line in prompt.splitlines():
                if line.lower().startswith("next question to ask:"):
                    question = line.split(":", 1)[1].strip()
            if "thank the candidate" in sys_l or "closing" in sys_l:
                return (
                    "Thanks so much for your time today — this was a great conversation. "
                    "We'll follow up on next steps shortly. Any questions for me?"
                )
            if "greet the candidate" in sys_l:
                return f"Hi, thanks for making the time today — I'm looking forward to this. To start: {question}"
            if "follow-up" in sys_l or "probing" in sys_l:
                if question and not question.startswith("(none"):
                    return f"Let me push on that a little — {question}"
                return "Can you be more specific? Give me a concrete example."
            if not question or question.startswith("(none"):
                return "Appreciate that — thanks for walking me through it."
            return f"Got it, thanks for sharing that. Let's move on: {question}"

        if "interview coach" in task:
            subject = candidate if candidate != "The candidate" else role
            return (
                f"In my experience as {subject}, I lean on my strengths in "
                f"{skills or 'the core competencies for this role'}. In one situation I "
                f"took ownership of a concrete problem, drove a focused solution, and "
                f"delivered a measurable result. I'd connect that directly to what "
                f"{company} needs in this role. (Draft answer — tailor it with a specific "
                f"example from your background.)"
            )

        if "cover letter" in task:
            return (
                f"Dear Hiring Manager,\n\n"
                f"I am writing to express my strong interest in the {role} position at "
                f"{company}. My background aligns closely with what you are looking for, "
                f"particularly my experience with {skills or 'the core requirements of this role'}.\n\n"
                f"Across my career I have consistently delivered measurable results, and I am "
                f"confident I can bring that same impact to {company}. I am especially drawn to "
                f"this opportunity because it lets me apply my strengths where they matter most.\n\n"
                f"I would welcome the chance to discuss how I can contribute to your team. "
                f"Thank you for your consideration.\n\n"
                f"Sincerely,\n{candidate}"
            )

        # Default: a professional summary paragraph.
        return (
            f"{candidate} is a results-driven professional targeting {role}. "
            f"Bringing hands-on strength in {skills or 'the required competencies'}, "
            f"with a track record of delivering outcomes that map directly to the needs of "
            f"{company}."
        )

    @staticmethod
    def _parse_fields(prompt: str) -> dict[str, str]:
        fields: dict[str, str] = {}
        for line in prompt.splitlines():
            if ":" in line:
                key, _, val = line.partition(":")
                key = key.strip().lower()
                if key in {"role", "company", "candidate", "top skills"}:
                    fields[key] = val.strip()
        return fields
