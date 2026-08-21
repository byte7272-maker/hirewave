"""DraftPrepEngine — with permission, auto-prepare application drafts (résumé +
cover letter) for the user's strong new matches, then notify them to review.

Drafts are exactly that — **drafts**. The existing approval gate still blocks
submission until the user approves each document, so nothing goes out
automatically. Jobs the user already has an application for are skipped.
"""

from __future__ import annotations

from typing import Callable, Optional

from jobsearch.models import (
    Application,
    Notification,
    NotificationType,
    UserProfile,
)


class DraftPrepEngine:
    def __init__(
        self,
        *,
        generation,
        matching,
        jobs,
        profiles,
        resumes,
        cover_letters,
        applications,
        verifications: dict,
        notifier: Optional[Callable[[Notification], None]] = None,
        recorder: Optional[Callable[..., object]] = None,
    ) -> None:
        self.generation = generation
        self.matching = matching
        self.jobs = jobs
        self.profiles = profiles
        self.resumes = resumes
        self.cover_letters = cover_letters
        self.applications = applications
        self.verifications = verifications
        self._notifier = notifier or (lambda n: None)
        self._record = recorder or (lambda *a, **k: None)

    def _visible(self, job) -> bool:
        v = self.verifications.get(job.id)
        return v is None or v.display_action != "hidden"

    def strong_matches(self, user_id: str, *, min_fit: int, limit: int):
        profile = self.profiles.get(user_id) or UserProfile(user_id=user_id)
        visible = [j for j in self.jobs.all() if self._visible(j)]
        ranked = self.matching.rank(profile, visible, limit=len(visible) or 1)
        already = {a.job_posting_id for a in self.applications.find(user_id=user_id)}
        picks = [r for r in ranked if round(r.score) >= min_fit and r.job.id not in already]
        return profile, picks[: max(0, limit)]

    def run(self, user_id: str, *, min_fit: int = 70, limit: int = 5) -> list[Application]:
        profile, picks = self.strong_matches(user_id, min_fit=min_fit, limit=limit)
        prepared: list[Application] = []
        for r in picks:
            resume = self.resumes.add(self.generation.generate_resume(profile, r.job))
            cover = self.cover_letters.add(self.generation.generate_cover_letter(profile, r.job, resume=resume))
            app = self.applications.add(Application(
                user_id=user_id, job_posting_id=r.job.id,
                resume_id=resume.id, cover_letter_id=cover.id,
            ))
            prepared.append(app)
            self._record(user_id, "prepare", job_id=r.job.id, status="proposed",
                         detail=f"Draft prepared: {r.job.title} at {r.job.company} ({round(r.score)}% fit)")
        if prepared:
            self._notifier(Notification(
                user_id=user_id, type=NotificationType.MATCH_FOUND,
                message=f"Prepared {len(prepared)} application draft(s) for strong matches — review & approve in Applications.",
            ))
        return prepared
