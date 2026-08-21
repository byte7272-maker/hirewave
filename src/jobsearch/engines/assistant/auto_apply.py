"""AutoApplyEngine — standing, pre-authorized auto-submission.

Composes the existing :class:`AssistantEngine` (fill plan + live/mock execute +
audit) with:

* a :class:`SessionStore` — the provider session the user connected themselves
  (cookies only, encrypted; the password never touched this app), and
* :class:`AutoApplyGrant` records — the user's explicit, bounded pre-permission
  to submit to named jobs or a criteria group.

A run is always inside the grant's limits (total cap, per-day cap, expiry,
verified-only) and every submission is audited. Credential fields are still
refused and a login-wall/CAPTCHA still escalates (it can't be auto-solved), so a
stale session degrades to "needs reconnect", never a bad submission.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable, Optional

from jobsearch.engines.assistant.form_fill import FormFillEngine
from jobsearch.engines.assistant.engine import AssistantEngine, demo_application_form
from jobsearch.engines.assistant.live_fill import build_browser_driver
from jobsearch.models import (
    Application,
    ApplicationStatus,
    AutoApplyCriteria,
    AutoApplyGrant,
    JobPosting,
    User,
    UserProfile,
)
from jobsearch.models.auto_apply import (
    GRANT_ACTIVE,
    GRANT_EXHAUSTED,
    GRANT_EXPIRED,
    GRANT_PAUSED,
    GRANT_REVOKED,
)
from jobsearch.models.common import utcnow
from jobsearch.models.notification import Notification, NotificationType
from jobsearch.store import InMemoryRepository, Repository, SessionStore


@dataclass
class JobOutcome:
    job_id: str
    title: str
    company: str
    status: str  # submitted | would_submit | needs_session | needs_input | needs_login | captcha | error | skipped
    detail: str = ""


@dataclass
class RunResult:
    grant_id: str
    dry_run: bool
    eligible: int
    attempted: int
    submitted: int
    remaining_total: int
    remaining_today: int
    grant_status: str
    outcomes: list[JobOutcome] = field(default_factory=list)
    detail: str = ""


DriverBuilder = Callable[..., tuple[object, bool]]

#: Providers where the platform's ToS makes silent bulk-submission risky. For
#: these, the human clicks Apply themselves (assisted mode) — automation only
#: fills the already-open form. Never auto-submitted server-side.
ASSISTED_PROVIDERS = {"linkedin"}


@dataclass
class QueueItem:
    """A job awaiting the user's manual Apply click (assisted mode)."""

    job_id: str
    title: str
    company: str
    url: str
    provider: str
    grant_id: str
    #: Non-credential field values the local assist agent types after the human
    #: clicks Apply (credential fields are excluded by the fill plan).
    fields: dict[str, str] = field(default_factory=dict)
    resume_name: str = ""


class AutoApplyEngine:
    def __init__(
        self,
        *,
        assistant: AssistantEngine,
        sessions: SessionStore,
        grants: Optional[Repository[AutoApplyGrant]] = None,
        users: Repository[User],
        profiles: Repository[UserProfile],
        jobs: Repository[JobPosting],
        resumes: Repository,
        cover_letters: Repository,
        applications: Repository[Application],
        documents=None,
        settings=None,
        driver_builder: DriverBuilder = build_browser_driver,
        notifier: Optional[Callable] = None,
        event_notifier: Optional[Callable[[str, int, list], None]] = None,
    ) -> None:
        self.assistant = assistant
        self.sessions = sessions
        self.grants = grants or InMemoryRepository()
        self.users = users
        self.profiles = profiles
        self.jobs = jobs
        self.resumes = resumes
        self.cover_letters = cover_letters
        self.applications = applications
        self.documents = documents
        self.settings = settings
        self._build_driver = driver_builder
        self._notify = notifier
        #: Optional multi-channel notifier(user_id, count, titles) for submissions.
        self.event_notifier = event_notifier
        self._form_fill: FormFillEngine = assistant.form_fill

    # ---- connected sessions ----------------------------------------------
    def connect_session(self, user_id: str, provider: str, storage_state: str, *, label: str = ""):
        return self.sessions.save(user_id=user_id, provider=provider.lower(), storage_state=storage_state, label=label)

    def list_sessions(self, user_id: str):
        return self.sessions.list_for(user_id)

    def session_for(self, user_id: str, provider: str):
        return self.sessions.get_record(user_id, provider.lower())

    def disconnect_session(self, user_id: str, provider: str) -> bool:
        return self.sessions.delete(user_id, provider.lower())

    # ---- grant CRUD -------------------------------------------------------
    def create_grant(
        self,
        user_id: str,
        *,
        name: str = "",
        scope: str = "criteria",
        job_ids: Optional[list[str]] = None,
        criteria: Optional[AutoApplyCriteria] = None,
        require_verified: bool = True,
        max_submits: int = 10,
        daily_cap: int = 5,
        expires_at: Optional[datetime] = None,
        mode: str = "auto",
        interval_minutes: int = 0,
    ) -> AutoApplyGrant:
        grant = AutoApplyGrant(
            user_id=user_id,
            name=name or ("Selected jobs" if scope == "jobs" else "Matching jobs"),
            scope="jobs" if scope == "jobs" else "criteria",
            job_ids=list(job_ids or []),
            criteria=criteria or AutoApplyCriteria(),
            require_verified=require_verified,
            max_submits=max(1, int(max_submits)),
            daily_cap=max(1, int(daily_cap)),
            expires_at=expires_at,
            mode="assisted" if mode == "assisted" else "auto",
            interval_minutes=max(0, int(interval_minutes)),
        )
        return self.grants.add(grant)

    def list_grants(self, user_id: str) -> list[AutoApplyGrant]:
        return sorted(self.grants.find(user_id=user_id), key=lambda g: g.created_at, reverse=True)

    def get_grant(self, grant_id: str, user_id: str) -> Optional[AutoApplyGrant]:
        g = self.grants.get(grant_id)
        return g if g and g.user_id == user_id else None

    def set_status(self, grant_id: str, user_id: str, status: str) -> Optional[AutoApplyGrant]:
        g = self.get_grant(grant_id, user_id)
        if g is None:
            return None
        if status in (GRANT_ACTIVE, GRANT_PAUSED, GRANT_REVOKED):
            g.status = status
            g.updated_at = utcnow()
            self.grants.add(g)
        return g

    def delete_grant(self, grant_id: str, user_id: str) -> bool:
        g = self.get_grant(grant_id, user_id)
        return self.grants.delete(grant_id) if g else False

    # ---- matching ---------------------------------------------------------
    def _matches(self, grant: AutoApplyGrant, job: JobPosting) -> bool:
        if grant.scope == "jobs":
            return job.id in grant.job_ids
        c = grant.criteria
        title = (job.title or "").lower()
        company = (job.company or "").lower()
        location = (job.location or "").lower()
        if c.title_keywords and not any(k.lower() in title for k in c.title_keywords):
            return False
        if c.locations and not any(l.lower() in location for l in c.locations):
            return False
        if c.remote is not None and job.remote != c.remote:
            return False
        if c.companies_allow and not any(a.lower() in company for a in c.companies_allow):
            return False
        if any(d.lower() in company for d in c.companies_deny if d):
            return False
        if c.sources and job.source_platform not in c.sources:
            return False
        if c.min_fit_score is not None and (job.match_score is None or job.match_score < c.min_fit_score):
            return False
        return True

    def _is_assisted(self, grant: AutoApplyGrant, job: JobPosting) -> bool:
        """A job is assisted (human clicks Apply) if the grant asks for it or the
        provider is ToS-sensitive."""
        return grant.mode == "assisted" or (job.source_platform or "").lower() in ASSISTED_PROVIDERS

    def eligible_jobs(self, grant: AutoApplyGrant) -> list[JobPosting]:
        applied = {a.job_posting_id for a in self.applications.find(user_id=grant.user_id)}
        out = []
        for job in self.jobs.all():
            if job.id in applied:
                continue
            if not self._matches(grant, job):
                continue
            if grant.require_verified and job.is_verified is not True:
                continue
            out.append(job)
        # best matches first (unknown score last)
        out.sort(key=lambda j: (j.match_score if j.match_score is not None else -1.0), reverse=True)
        return out

    # ---- run --------------------------------------------------------------
    @staticmethod
    def _today() -> str:
        return utcnow().date().isoformat()

    def _roll_day(self, grant: AutoApplyGrant) -> None:
        today = self._today()
        if grant.day_marker != today:
            grant.day_marker = today
            grant.submitted_today = 0

    def _prepare(self, user: User, profile: UserProfile, job: JobPosting):
        """Build a fill plan + résumé bytes for a job (credentials auto-blocked)."""
        resume_name, resume_data = "", b""
        resumes = self.resumes.find(user_id=user.id)
        if resumes:
            latest = sorted(resumes, key=lambda r: r.id)[-1]
            resume_name = latest.original_filename or f"{latest.target_role or 'resume'}.md"
            if self.documents is not None:
                try:
                    stored = self.documents.get(latest.id)
                    resume_data = stored[0] if stored else b""
                except Exception:  # noqa: BLE001
                    resume_data = b""
        covers = self.cover_letters.find(user_id=user.id)
        cover_text = sorted(covers, key=lambda c: c.id)[-1].content if covers else ""
        plan = self._form_fill.plan(user, profile, demo_application_form(), resume_name=resume_name, cover_text=cover_text)
        return plan, resume_name, resume_data

    def _record_application(self, user_id: str, job: JobPosting, confirmation: str) -> None:
        self.applications.add(Application(
            user_id=user_id,
            job_posting_id=job.id,
            status=ApplicationStatus.SUBMITTED,
            submitted_at=utcnow(),
            platform_response={"confirmation": confirmation, "auto_apply": True},
        ))

    def run_grant(self, grant: AutoApplyGrant, *, dry_run: bool = False, limit: Optional[int] = None) -> RunResult:
        now = utcnow()
        # expiry check
        if grant.expires_at and grant.expires_at <= now and grant.status == GRANT_ACTIVE:
            grant.status = GRANT_EXPIRED
            grant.updated_at = now
            self.grants.add(grant)

        self._roll_day(grant)
        eligible = self.eligible_jobs(grant)

        def result(outcomes, submitted, attempted, detail=""):
            return RunResult(
                grant_id=grant.id, dry_run=dry_run, eligible=len(eligible),
                attempted=attempted, submitted=submitted,
                remaining_total=grant.remaining_total,
                remaining_today=max(0, grant.daily_cap - grant.submitted_today),
                grant_status=grant.status, outcomes=outcomes, detail=detail,
            )

        if not dry_run and grant.status != GRANT_ACTIVE:
            return result([], 0, 0, detail=f"Grant is {grant.status} — not run.")

        budget = min(grant.remaining_total, max(0, grant.daily_cap - grant.submitted_today))
        if limit is not None:
            budget = min(budget, max(0, int(limit)))

        user = self.users.get(grant.user_id)
        profile = self.profiles.get(grant.user_id) or UserProfile(user_id=grant.user_id)
        outcomes: list[JobOutcome] = []
        submitted_titles: list[str] = []
        submitted = attempted = 0

        for job in eligible:
            oc = JobOutcome(job_id=job.id, title=job.title, company=job.company, status="skipped")

            # Assisted jobs (LinkedIn, or an assisted grant) are never submitted
            # server-side — they're queued for the user to click Apply, then the
            # local assist agent fills the open form. They don't consume budget.
            if self._is_assisted(grant, job):
                oc.status = "queued"
                oc.detail = "Awaiting your Apply click — see the apply queue."
                outcomes.append(oc)
                continue

            if submitted >= budget:
                break

            if dry_run:
                oc.status = "would_submit"
                outcomes.append(oc)
                attempted += 1
                continue

            platform = (job.source_platform or "linkedin").lower()
            storage = self.sessions.reveal(grant.user_id, platform) or ""
            # In live (playwright) mode a connected session is required; without
            # one we skip rather than hit a login wall.
            if self.settings is not None and getattr(self.settings, "assistant_browser", "mock") == "playwright" and not storage:
                oc.status = "needs_session"
                oc.detail = f"Connect your {platform} session to auto-apply here."
                outcomes.append(oc)
                continue

            plan, resume_name, resume_data = self._prepare(user, profile, job)
            driver, live = self._build_driver(self.settings, platform=platform, storage_state=storage)
            res = self.assistant.execute_fill(
                user, plan, driver, url=job.url, submit=True, job_id=job.id,
                resume_name=resume_name, resume_data=resume_data, live=live,
            )
            attempted += 1
            oc.status = res.status
            oc.detail = res.detail
            if res.status == "submitted":
                submitted += 1
                submitted_titles.append(job.title)
                grant.submits_used += 1
                grant.submitted_today += 1
                self.sessions.mark_used(grant.user_id, platform)
                self._record_application(grant.user_id, job, res.confirmation)
            elif res.status in ("needs_login", "captcha"):
                # The connected session is stale / challenged — mark it so the
                # user reconnects; don't keep hammering the same provider.
                self.sessions.mark_status(grant.user_id, platform, "expired")
            outcomes.append(oc)

        grant.last_run_at = now
        if grant.submits_used >= grant.max_submits:
            grant.status = GRANT_EXHAUSTED
        if not dry_run:
            grant.updated_at = now
            self.grants.add(grant)
            if submitted:
                # When wired, the multi-channel notifier (SMS / push / email +
                # in-app, honoring the user's reminder prefs & quiet hours) owns
                # this. Otherwise fall back to a plain in-app notification.
                if self.event_notifier:
                    try:
                        self.event_notifier(grant.user_id, submitted, submitted_titles)
                    except Exception:  # noqa: BLE001
                        pass
                elif self._notify:
                    try:
                        self._notify(Notification(
                            user_id=grant.user_id,
                            type=NotificationType.APPLICATION_SUBMITTED,
                            message=f"Auto-apply '{grant.name}' submitted {submitted} application(s).",
                        ))
                    except Exception:  # noqa: BLE001
                        pass

        return result(outcomes, submitted, attempted)

    # ---- assisted apply queue --------------------------------------------
    def queue(self, user_id: str) -> list[QueueItem]:
        """Jobs across the user's active grants that await a manual Apply click
        (assisted mode), each with the non-credential field values the local
        assist agent will type once the human opens the form."""
        user = self.users.get(user_id)
        if user is None:
            return []
        profile = self.profiles.get(user_id) or UserProfile(user_id=user_id)
        seen: set[str] = set()
        items: list[QueueItem] = []
        for grant in self.list_grants(user_id):
            if grant.status != GRANT_ACTIVE:
                continue
            for job in self.eligible_jobs(grant):
                if not self._is_assisted(grant, job) or job.id in seen:
                    continue
                seen.add(job.id)
                plan, resume_name, _ = self._prepare(user, profile, job)
                fields = {e.field: e.value for e in plan.entries if e.status == "filled" and e.value}
                items.append(QueueItem(
                    job_id=job.id, title=job.title, company=job.company, url=job.url,
                    provider=(job.source_platform or "").lower(), grant_id=grant.id,
                    fields=fields, resume_name=resume_name,
                ))
        return items

    # ---- scheduling -------------------------------------------------------
    def due_grants(self, user_id: Optional[str] = None, *, now: Optional[datetime] = None) -> list[AutoApplyGrant]:
        """Active grants with a cadence set that are due to run. ``user_id=None``
        spans all users (for the system scheduler)."""
        now = now or utcnow()
        grants = self.grants.find(user_id=user_id) if user_id else self.grants.all()
        due = []
        for g in grants:
            if g.status != GRANT_ACTIVE or g.interval_minutes <= 0:
                continue
            if g.last_run_at is None or g.last_run_at + timedelta(minutes=g.interval_minutes) <= now:
                due.append(g)
        return due

    def run_due(self, user_id: Optional[str] = None, *, now: Optional[datetime] = None) -> list[RunResult]:
        """Run every due grant. Returns a RunResult per grant."""
        return [self.run_grant(g) for g in self.due_grants(user_id, now=now)]
