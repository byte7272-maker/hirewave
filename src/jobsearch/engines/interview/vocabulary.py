"""Vocabulary analysis for spoken interview answers.

Takes a transcript (recorded, or the running text from live speech-to-text) and
returns: filler words, weak/vague words with stronger alternatives, over-used
words, a richness metric, and an overall 0-100 strength score. Purely
deterministic (no LLM needed) so it's fast enough to run on a live transcript;
an optional LLM pass rewrites the whole answer with the stronger wording.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Optional

from jobsearch.llm import LLMProvider
from jobsearch.models.interview import VocabSuggestion, VocabularyAnalysis

# Filler / hedging words and phrases (spoken-answer noise).
_FILLER_PHRASES = [
    "you know", "i mean", "kind of", "sort of", "i guess", "i think", "i suppose",
    "so yeah", "or something", "or whatever", "to be honest", "at the end of the day",
]
_FILLER_WORDS = {
    "um", "uh", "erm", "ah", "like", "basically", "actually", "literally", "honestly",
    "just", "really", "very", "stuff", "kinda", "sorta", "maybe", "right", "okay", "well",
}

# Weak / vague words → stronger, more precise alternatives (interview register).
_WEAK: dict[str, list[str]] = {
    "responsible for": ["owned", "led", "drove"],
    "worked on": ["led", "owned", "built", "drove"],
    "helped with": ["drove", "enabled", "contributed to"],
    "dealt with": ["resolved", "navigated", "addressed"],
    "a lot of": ["substantial", "significant", "considerable"],
    "a lot": ["substantially", "significantly"],
    "lots of": ["numerous", "substantial"],
    "team player": ["collaborative", "cross-functional contributor"],
    "hard worker": ["diligent", "results-driven"],
    "did": ["executed", "delivered", "drove"],
    "made": ["built", "created", "developed"],
    "make": ["build", "create", "develop"],
    "helped": ["enabled", "drove", "accelerated"],
    "help": ["enable", "support", "drive"],
    "got": ["achieved", "secured", "earned"],
    "get": ["achieve", "secure", "earn"],
    "used": ["leveraged", "applied", "utilized"],
    "use": ["leverage", "apply"],
    "good": ["strong", "effective", "solid"],
    "great": ["outstanding", "exceptional"],
    "nice": ["polished", "clean", "effective"],
    "big": ["significant", "substantial", "major"],
    "handled": ["managed", "owned", "resolved"],
    "handle": ["manage", "own", "resolve"],
    "improved": ["boosted", "increased", "optimized"],
    "improve": ["boost", "increase", "optimize"],
    "fixed": ["resolved", "corrected", "remediated"],
    "started": ["initiated", "launched", "spearheaded"],
    "showed": ["demonstrated", "proved", "illustrated"],
    "gave": ["provided", "delivered", "presented"],
    "thing": ["aspect", "element", "component"],
    "things": ["aspects", "elements", "components"],
    "stuff": ["work", "tasks", "responsibilities"],
}

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with",
    "as", "by", "is", "was", "were", "are", "be", "been", "it", "this", "that", "these",
    "those", "i", "we", "you", "he", "she", "they", "my", "our", "your", "me", "us",
    "so", "then", "when", "where", "which", "who", "what", "how", "there", "here", "not",
    "had", "has", "have", "do", "did", "will", "would", "can", "could", "about", "from",
    "into", "out", "up", "down", "over", "after", "before", "if", "than", "them", "their",
}
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")


def _sentence_case_pick(alts: list[str]) -> list[str]:
    return alts


class VocabularyAnalyzer:
    def __init__(self, llm: Optional[LLMProvider] = None) -> None:
        self.llm = llm

    def analyze(self, text: str, *, rewrite: bool = False) -> VocabularyAnalysis:
        raw = (text or "").strip()
        words = _WORD_RE.findall(raw)
        total = len(words)
        if total == 0:
            return VocabularyAnalysis(summary="No speech to analyze yet.")

        lower = raw.lower()
        lwords = [w.lower() for w in words]

        suggestions: list[VocabSuggestion] = []
        filler_count = 0

        # --- multi-word filler phrases + weak phrases (scan the raw text) -----
        seen_phrases: set[str] = set()
        for phrase in _FILLER_PHRASES:
            n = len(re.findall(r"\b" + re.escape(phrase) + r"\b", lower))
            if n:
                filler_count += n
                suggestions.append(VocabSuggestion(original=phrase, kind="filler", count=n,
                                                   note="Filler phrase — cut it for a crisper answer."))
                seen_phrases.add(phrase)
        for phrase, alts in _WEAK.items():
            if " " not in phrase:
                continue
            n = len(re.findall(r"\b" + re.escape(phrase) + r"\b", lower))
            if n:
                suggestions.append(VocabSuggestion(original=phrase, kind="weak", count=n,
                                                   suggestions=_sentence_case_pick(alts),
                                                   note="Vague — lead with a strong action verb."))
                seen_phrases.add(phrase)

        # --- single-word fillers + weak words --------------------------------
        counts = Counter(lwords)
        for w, alts in _WEAK.items():
            if " " in w:
                continue
            c = counts.get(w, 0)
            if c and not any(w in p for p in seen_phrases):
                suggestions.append(VocabSuggestion(original=w, kind="weak", count=c,
                                                   suggestions=_sentence_case_pick(alts),
                                                   note="Weak verb/word — a stronger choice lands better."))
        for w in _FILLER_WORDS:
            c = counts.get(w, 0)
            if c:
                filler_count += c
                suggestions.append(VocabSuggestion(original=w, kind="filler", count=c,
                                                   note="Filler — remove or replace with substance."))

        # --- over-used content words -----------------------------------------
        content = [w for w in lwords if w not in _STOPWORDS and w not in _FILLER_WORDS and len(w) > 3]
        content_counts = Counter(content)
        overuse_threshold = max(3, round(len(content) * 0.08))
        for w, c in content_counts.items():
            if c >= overuse_threshold and w not in _WEAK:
                suggestions.append(VocabSuggestion(original=w, kind="overused", count=c,
                                                   note=f"Used {c}× — vary it so it doesn't feel repetitive."))

        # --- metrics + score --------------------------------------------------
        unique_content = len(set(content))
        richness = round(unique_content / len(content), 3) if content else 0.0
        filler_ratio = round(filler_count / total, 3)
        weak_count = sum(s.count for s in suggestions if s.kind == "weak")
        overused_count = sum(1 for s in suggestions if s.kind == "overused")

        score = 100
        score -= min(45, filler_count * 6)
        score -= min(25, weak_count * 3)
        score -= min(15, overused_count * 4)
        if total >= 40 and richness < 0.55:
            score -= min(15, round((0.55 - richness) * 60))
        score = max(0, min(100, score))

        summary = self._summary(filler_count, weak_count, overused_count, richness, score)

        analysis = VocabularyAnalysis(
            word_count=total, unique_words=len(set(lwords)), vocabulary_richness=richness,
            filler_count=filler_count, filler_ratio=filler_ratio, score=score,
            suggestions=sorted(suggestions, key=lambda s: (-s.count, s.kind)),
            summary=summary,
        )
        if rewrite and self.llm is not None:
            analysis.polished = self._rewrite(raw)
        return analysis

    @staticmethod
    def _summary(fillers: int, weak: int, overused: int, richness: float, score: int) -> str:
        if score >= 85:
            return "Strong, precise vocabulary — keep it up."
        parts = []
        if fillers:
            parts.append(f"trim {fillers} filler word{'s' if fillers != 1 else ''}")
        if weak:
            parts.append("swap vague words for strong action verbs")
        if overused:
            parts.append("vary a few over-used words")
        if not parts:
            parts.append("add more specific, varied wording")
        return "To sharpen this answer: " + ", ".join(parts) + "."

    def _rewrite(self, text: str) -> str:  # pragma: no cover - exercised via LLM in prod
        system = (
            "You are an interview coach. Rewrite the candidate's spoken answer with "
            "stronger, more precise, confident language: remove filler, use strong "
            "action verbs, keep it truthful and the same meaning and length. Return "
            "only the rewritten answer."
        )
        try:
            return self.llm.complete(text, system=system, max_tokens=300).strip()
        except Exception:  # noqa: BLE001
            return ""
