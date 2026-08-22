"""ExperienceEngine — CRUD over a user's work-experience highlights plus the
assembly of those highlights into a grounding-context block for interview prep.

Deliberately thin and deterministic: no LLM. The *value* is (a) giving users a
place to bring in richer narrative material than a résumé's bullets — self-written
or produced by an AI agent in their own work environment — and (b) feeding that
material back into interview grounding so suggested answers can reference real
projects the candidate might not have recalled.
"""

from __future__ import annotations

from typing import Optional

from jobsearch.models import ExperienceHighlight, ExperienceKind, ExperienceSource
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository

_MAX_CONTENT = 20000


def _coerce_kind(value) -> ExperienceKind:
    if isinstance(value, ExperienceKind):
        return value
    try:
        return ExperienceKind(str(value))
    except ValueError:
        return ExperienceKind.HIGHLIGHT


def _coerce_source(value) -> ExperienceSource:
    if isinstance(value, ExperienceSource):
        return value
    try:
        return ExperienceSource(str(value))
    except ValueError:
        return ExperienceSource.SELF_WRITTEN


class ExperienceEngine:
    """Manage a user's work-experience highlights."""

    def __init__(self, repo: Optional[Repository[ExperienceHighlight]] = None) -> None:
        self.repo = repo or InMemoryRepository(id_attr="id")

    # -- CRUD ---------------------------------------------------------------
    def create(
        self,
        user_id: str,
        *,
        content: str,
        title: str = "",
        kind=ExperienceKind.HIGHLIGHT,
        source=ExperienceSource.SELF_WRITTEN,
        source_tool: str = "",
        skills: Optional[list[str]] = None,
        company: str = "",
        period: str = "",
        original_filename: str = "",
        content_type: str = "",
    ) -> ExperienceHighlight:
        body = (content or "").strip()
        if len(body) < 10:
            raise ValueError("highlight content is too short (min 10 characters)")
        item = ExperienceHighlight(
            user_id=user_id,
            title=(title or "").strip(),
            content=body[:_MAX_CONTENT],
            kind=_coerce_kind(kind),
            source=_coerce_source(source),
            source_tool=(source_tool or "").strip(),
            skills=[s.strip() for s in (skills or []) if s and s.strip()],
            company=(company or "").strip(),
            period=(period or "").strip(),
            original_filename=original_filename,
            content_type=content_type,
        )
        return self.repo.add(item)

    def get(self, item_id: str) -> Optional[ExperienceHighlight]:
        return self.repo.get(item_id)

    def get_owned(self, item_id: str, user_id: str) -> Optional[ExperienceHighlight]:
        item = self.repo.get(item_id)
        if item is None or item.user_id != user_id:
            return None
        return item

    def list_for(self, user_id: str) -> list[ExperienceHighlight]:
        items = self.repo.find(user_id=user_id)
        return sorted(items, key=lambda x: x.created_at, reverse=True)

    def update(self, item: ExperienceHighlight, fields: dict) -> ExperienceHighlight:
        for name, value in fields.items():
            if value is None:
                continue
            if name == "kind":
                value = _coerce_kind(value)
            elif name == "source":
                value = _coerce_source(value)
            elif name == "content":
                value = (str(value).strip())[:_MAX_CONTENT]
            elif name == "skills":
                value = [s.strip() for s in value if s and s.strip()]
            setattr(item, name, value)
        item.updated_at = utcnow()
        return self.repo.add(item)  # persist the mutation

    def delete(self, item_id: str) -> None:
        self.repo.delete(item_id)

    # -- grounding context --------------------------------------------------
    def context_text(
        self, user_id: str, *, limit: int = 12, max_chars: int = 6000
    ) -> str:
        """Compile the user's highlights into a factual grounding block for the
        interview engines. Empty string when the user has no highlights."""
        items = self.list_for(user_id)[:limit]
        if not items:
            return ""
        lines = [
            "The candidate provided these work-experience highlights (written by "
            "them or summarized by an AI assistant in their work environment). "
            "Treat them as factual context you may ground answers in:"
        ]
        for i, it in enumerate(items, 1):
            meta = []
            if it.company:
                meta.append(it.company)
            if it.period:
                meta.append(it.period)
            head = it.title or it.kind.value.capitalize()
            suffix = f" ({', '.join(meta)})" if meta else ""
            lines.append(f"{i}. [{it.kind.value}] {head}{suffix} - {it.content.strip()}")
        text = "\n".join(lines)
        return text[:max_chars]
