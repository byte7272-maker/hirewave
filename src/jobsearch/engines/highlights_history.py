"""Remember the editor's generated bullets + the prompt behind them, per résumé.

A thin persistence layer over the ``highlights_runs`` repository so the Documents
editor can reload the **last generated bullets and prompt by default** (and offer the
recent prompt history) instead of making the user re-run the AI every session. History
is bounded per résumé so it can't grow without limit.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Optional

from jobsearch.models import HighlightsRun
from jobsearch.models.common import utcnow
from jobsearch.store import Repository

#: Keep at most this many runs per (user, résumé); older ones are pruned on write.
MAX_RUNS = 12
#: Cap the stored prompt so a huge paste can't bloat a row.
PROMPT_CAP = 12000


class HighlightsHistory:
    def __init__(self, *, repo: Repository[HighlightsRun]) -> None:
        self.repo = repo

    # -- write --------------------------------------------------------------
    def record(
        self,
        *,
        user_id: str,
        resume_id: str,
        mode: str,
        prompt: str,
        items: list[dict[str, Any]],
        job_posting_id: str = "",
    ) -> HighlightsRun:
        """Save a freshly generated bullet set. If it is identical to the most recent
        run (same mode + prompt + items), refresh that one instead of duplicating."""
        prompt = (prompt or "").strip()[:PROMPT_CAP]
        items = items or []
        latest = self.latest(user_id, resume_id)
        if latest is not None and latest.mode == mode and latest.prompt == prompt and latest.items == items:
            latest.updated_at = utcnow()
            return self.repo.add(latest)
        # Strictly-monotonic created_at so ordering (and pruning) is deterministic even
        # when two runs land in the same clock tick (real runs are minutes apart).
        now = utcnow()
        if latest is not None and latest.created_at >= now:
            now = latest.created_at + timedelta(microseconds=1)
        run = HighlightsRun(
            user_id=user_id,
            resume_id=resume_id,
            mode=mode,
            prompt=prompt,
            job_posting_id=job_posting_id or "",
            items=items,
            created_at=now,
            updated_at=now,
        )
        self.repo.add(run)
        self._prune(user_id, resume_id)
        return run

    def set_states(
        self, run_id: str, user_id: str, states: dict[str, str]
    ) -> Optional[HighlightsRun]:
        """Persist per-item accept/reject on a run so its review resumes next session.
        Merges into any existing states; only "accepted"/"rejected" values are kept."""
        run = self.get(run_id, user_id)
        if run is None:
            return None
        merged = dict(run.item_states)
        for key, val in (states or {}).items():
            if val in ("accepted", "rejected"):
                merged[str(key)] = val
            elif val in ("", "pending", None):
                merged.pop(str(key), None)
        run.item_states = merged
        run.updated_at = utcnow()
        return self.repo.add(run)

    def clear(self, user_id: str, resume_id: str) -> int:
        """Delete all saved runs for a résumé (user asked to start fresh). Returns count."""
        runs = self._runs(user_id, resume_id)
        for r in runs:
            self.repo.delete(r.id)
        return len(runs)

    # -- read ---------------------------------------------------------------
    def latest(self, user_id: str, resume_id: str) -> Optional[HighlightsRun]:
        runs = self._runs(user_id, resume_id)
        return runs[0] if runs else None

    def list(self, user_id: str, resume_id: str, *, limit: int = MAX_RUNS) -> list[HighlightsRun]:
        return self._runs(user_id, resume_id)[: max(1, limit)]

    def get(self, run_id: str, user_id: str) -> Optional[HighlightsRun]:
        run = self.repo.get(run_id)
        return run if run is not None and run.user_id == user_id else None

    # -- internals ----------------------------------------------------------
    def _runs(self, user_id: str, resume_id: str) -> list[HighlightsRun]:
        """This user's runs for one résumé, newest first."""
        runs = [r for r in self.repo.find(user_id=user_id) if r.resume_id == resume_id]
        return sorted(runs, key=lambda r: r.created_at, reverse=True)

    def _prune(self, user_id: str, resume_id: str) -> None:
        for stale in self._runs(user_id, resume_id)[MAX_RUNS:]:
            self.repo.delete(stale.id)
