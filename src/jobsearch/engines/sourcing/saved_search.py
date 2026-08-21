"""SavedSearchEngine — schedule and run the agent's recurring job searches."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable, Optional

from jobsearch.engines.sourcing.aggregator import AggregationResult, JobAggregator
from jobsearch.engines.sourcing.sources import JobQuery
from jobsearch.models import (
    Notification,
    NotificationType,
    SavedSearch,
    UserProfile,
)
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository


class SavedSearchEngine:
    def __init__(
        self,
        *,
        repo: Optional[Repository[SavedSearch]] = None,
        aggregator: JobAggregator,
        matching,
        profiles: Repository[UserProfile],
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.repo = repo or InMemoryRepository(id_attr="id")
        self.aggregator = aggregator
        self.matching = matching
        self.profiles = profiles
        self._notifier = notifier or (lambda n: None)

    # -- CRUD ---------------------------------------------------------------
    def create(
        self,
        user_id: str,
        *,
        role: str,
        location: str = "",
        remote: Optional[bool] = None,
        sources: Optional[list[str]] = None,
        interval_minutes: int = 1440,
    ) -> SavedSearch:
        if not role.strip():
            raise ValueError("role is required")
        search = SavedSearch(
            user_id=user_id,
            role=role.strip(),
            location=location.strip(),
            remote=remote,
            sources=sources or [],
            interval_minutes=max(5, interval_minutes),
        )
        return self.repo.add(search)

    def list(self, user_id: str) -> list[SavedSearch]:
        return sorted(self.repo.find(user_id=user_id), key=lambda s: s.created_at, reverse=True)

    def get(self, search_id: str, user_id: str) -> Optional[SavedSearch]:
        s = self.repo.get(search_id)
        return s if s and s.user_id == user_id else None

    def delete(self, search_id: str, user_id: str) -> bool:
        if self.get(search_id, user_id) is None:
            return False
        return self.repo.delete(search_id)

    def set_active(self, search_id: str, user_id: str, active: bool) -> Optional[SavedSearch]:
        s = self.get(search_id, user_id)
        if s is None:
            return None
        s.active = active
        return self.repo.add(s)

    # -- running ------------------------------------------------------------
    def run(self, search: SavedSearch, *, now: Optional[datetime] = None) -> AggregationResult:
        query = JobQuery(role=search.role, location=search.location, remote=search.remote)
        sources_filter = set(search.sources) or None
        result = self.aggregator.search(query, sources_filter=sources_filter)

        search.last_run_at = now or utcnow()
        search.last_new_count = result.ingested - result.hidden
        self.repo.add(search)
        self._notify(search, result)
        return result

    def run_now(self, search_id: str, user_id: str) -> Optional[AggregationResult]:
        s = self.get(search_id, user_id)
        return self.run(s) if s else None

    def due(self, user_id: str, *, now: Optional[datetime] = None) -> list[SavedSearch]:
        now = now or utcnow()
        out = []
        for s in self.list(user_id):
            if not s.active:
                continue
            if s.last_run_at is None or s.last_run_at + timedelta(minutes=s.interval_minutes) <= now:
                out.append(s)
        return out

    def run_due(self, user_id: str, *, now: Optional[datetime] = None) -> list[AggregationResult]:
        return [self.run(s, now=now) for s in self.due(user_id, now=now)]

    # -- notification -------------------------------------------------------
    def _notify(self, search: SavedSearch, result: AggregationResult) -> None:
        visible_ids = [
            jid for jid in result.job_ids
            if (v := self.aggregator.verifications.get(jid)) is None or v.display_action != "hidden"
        ]
        if not visible_ids:
            return
        profile = self.profiles.get(search.user_id) or UserProfile(user_id=search.user_id)
        new_jobs = [j for j in (self.aggregator.jobs.get(i) for i in visible_ids) if j]
        top = None
        ranked = self.matching.rank(profile, new_jobs, limit=1) if new_jobs else []
        if ranked:
            top = ranked[0].job
        msg = f"{len(visible_ids)} new role(s) for “{search.role}”"
        if top:
            msg += f" — top match: {top.title} at {top.company}"
        self._notifier(
            Notification(user_id=search.user_id, type=NotificationType.MATCH_FOUND, message=msg)
        )
