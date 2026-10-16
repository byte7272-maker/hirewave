"""Route classified job emails into the applications tracker.

When a mailbox scan (``/inbox/scan``) finds job email of a *progress* kind —
``application`` / ``interview`` / ``offer`` / ``rejection`` — this engine advances
the matching :class:`Application` so the tracker reflects inbox reality on its own.
It is strictly one-way: nothing is sent, and a non-progress kind (``alert`` /
``recruiter``) is a lead, not an application, so it is never routed here.

Matching an email to an application is deterministic and conservative:

* **link** — the email's posting URL equals/contains a tracked job's ``url``
  (strongest signal), else
* **company (+ role)** — the email's company matches a tracked job's company, with
  the job title breaking ties when the email names a role.

A matched application only ever **advances** (by a fixed status rank); a stale
"application received" email can't drag an ``offered`` row back to ``submitted``.
A ``rejection`` is terminal and always applies (unless already rejected). When no
application matches but the email ties to a known posting, a new tracker row is
created at the mapped status — the email implies an application existed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from jobsearch.engines.sourcing.job_email import JobEmail
from jobsearch.models import (
    Application,
    ApplicationStatus,
    JobPosting,
    Notification,
    NotificationType,
)
from jobsearch.models.common import utcnow
from jobsearch.store import Repository

# A job email's KIND maps to the application status it implies. Only these four
# progress kinds route; ``alert`` / ``recruiter`` are leads and are skipped.
_KIND_TO_STATUS: dict[str, ApplicationStatus] = {
    "application": ApplicationStatus.SUBMITTED,
    "interview": ApplicationStatus.INTERVIEWING,
    "offer": ApplicationStatus.OFFERED,
    "rejection": ApplicationStatus.REJECTED,
}

# Forward-only rank: a routed email may advance an application to a higher rank but
# never downgrade it. ``rejection`` is handled separately (terminal, always applies).
_STATUS_RANK: dict[ApplicationStatus, int] = {
    ApplicationStatus.DRAFT: 0,
    ApplicationStatus.PENDING_APPROVAL: 1,
    ApplicationStatus.SUBMITTED: 2,
    ApplicationStatus.INTERVIEWING: 3,
    ApplicationStatus.OFFERED: 4,
    ApplicationStatus.REJECTED: 5,  # terminal
}

# Positive progress worth an out-of-band notification.
_NOTIFY_STATUSES = {ApplicationStatus.INTERVIEWING, ApplicationStatus.OFFERED}

_COMPANY_SUFFIXES = re.compile(
    r"\b(?:inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|"
    r"gmbh|plc|group|holdings|technologies|technology|labs|software|systems)\b",
    re.I,
)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _norm_company(name: str) -> str:
    """A comparable company key: lower-cased, suffixes/punctuation stripped
    ('Acme, Inc.' and 'Acme Corporation' both -> 'acme')."""
    s = (name or "").lower()
    s = _COMPANY_SUFFIXES.sub(" ", s)
    s = _NON_ALNUM.sub(" ", s)
    return " ".join(s.split()).strip()


def _companies_match(a: str, b: str) -> bool:
    """True when two normalized company names are equal or one clearly contains the
    other as a whole-token prefix (so 'acme' matches 'acme payments')."""
    na, nb = _norm_company(a), _norm_company(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # whole-token containment, shorter inside longer (guards 'ace' vs 'acme')
    short, long = (na, nb) if len(na) <= len(nb) else (nb, na)
    return long == short or long.startswith(short + " ") or (" " + short + " ") in (" " + long + " ")


def _norm_role(title: str) -> str:
    return _NON_ALNUM.sub(" ", (title or "").lower()).strip()


def _roles_match(a: str, b: str) -> bool:
    ra, rb = _norm_role(a), _norm_role(b)
    if not ra or not rb:
        return False
    return ra == rb or ra in rb or rb in ra


def _links_match(email_link: str, job_url: str) -> bool:
    el, ju = (email_link or "").strip(), (job_url or "").strip()
    if not el or not ju:
        return False
    return el == ju or el in ju or ju in el


@dataclass
class RoutedApplication:
    application_id: str
    job_posting_id: str
    company: str
    role: str
    kind: str
    status: str          # the application's status AFTER routing
    action: str          # "created" | "advanced" | "unchanged"
    from_status: str = ""  # prior status (for "advanced")


@dataclass
class RoutingResult:
    routed: int = 0       # progress-kind emails that matched or created a row
    created: int = 0
    advanced: int = 0
    unchanged: int = 0
    skipped: int = 0      # progress-kind emails with no match and no known posting
    by_status: dict[str, int] = field(default_factory=dict)
    applications: list[RoutedApplication] = field(default_factory=list)


class ApplicationRouter:
    """Advance the applications tracker from classified job email. One-way only."""

    def __init__(
        self,
        *,
        applications: Repository[Application],
        jobs: Repository[JobPosting],
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.applications = applications
        self.jobs = jobs
        self._notifier = notifier or (lambda n: None)

    # -- public -------------------------------------------------------------
    def route(self, user_id: str, emails: list[JobEmail]) -> RoutingResult:
        """Route a batch of already-classified job emails for one user.

        Only the four progress kinds act; everything else is ignored. Returns a
        summary with a per-application record of what changed."""
        result = RoutingResult()
        # Snapshot the user's applications + their postings once per batch.
        user_apps = self.applications.find(user_id=user_id)
        for email in emails or []:
            status = _KIND_TO_STATUS.get(email.kind)
            if status is None:
                continue  # alert / recruiter / other -> not an application event
            record = self._route_one(user_id, email, status, user_apps)
            if record is None:
                result.skipped += 1
                continue
            result.routed += 1
            result.by_status[record.status] = result.by_status.get(record.status, 0) + 1
            if record.action == "created":
                result.created += 1
            elif record.action == "advanced":
                result.advanced += 1
            else:
                result.unchanged += 1
            result.applications.append(record)
        return result

    # -- internals ----------------------------------------------------------
    def _route_one(
        self,
        user_id: str,
        email: JobEmail,
        new_status: ApplicationStatus,
        user_apps: list[Application],
    ) -> Optional[RoutedApplication]:
        match = self._best_application(email, user_apps)
        if match is not None:
            app, job = match
            return self._apply_status(app, job, email, new_status)

        # No existing application — create one only if we can tie the email to a
        # known posting (so the row is real, not a guess).
        job = self._best_posting(user_id, email)
        if job is None:
            return None
        app = Application(user_id=user_id, job_posting_id=job.id, status=new_status)
        if new_status == ApplicationStatus.SUBMITTED:
            app.submitted_at = utcnow()
        app.record_event(
            "created_from_inbox",
            kind=email.kind,
            status=new_status.value,
            sender=email.sender_domain,
            subject=email.subject,
            confidence=email.confidence,
        )
        self.applications.add(app)
        user_apps.append(app)  # so a later email in the same batch can find it
        self._maybe_notify(user_id, app, job, new_status, created=True)
        return RoutedApplication(
            application_id=app.id,
            job_posting_id=job.id,
            company=job.company or email.company,
            role=job.title or email.role,
            kind=email.kind,
            status=new_status.value,
            action="created",
        )

    def _apply_status(
        self,
        app: Application,
        job: Optional[JobPosting],
        email: JobEmail,
        new_status: ApplicationStatus,
    ) -> RoutedApplication:
        prior = app.status
        advance = self._should_advance(prior, new_status)
        company = (job.company if job else "") or email.company
        role = (job.title if job else "") or email.role
        if not advance:
            app.record_event(
                "inbox_status_noop",
                kind=email.kind,
                implied=new_status.value,
                current=prior.value,
                sender=email.sender_domain,
            )
            self.applications.add(app)
            return RoutedApplication(
                application_id=app.id,
                job_posting_id=app.job_posting_id,
                company=company,
                role=role,
                kind=email.kind,
                status=prior.value,
                action="unchanged",
                from_status=prior.value,
            )
        app.status = new_status
        app.updated_at = utcnow()
        if new_status == ApplicationStatus.SUBMITTED and app.submitted_at is None:
            app.submitted_at = utcnow()
        app.record_event(
            "inbox_status_update",
            kind=email.kind,
            status=new_status.value,
            previous=prior.value,
            sender=email.sender_domain,
            subject=email.subject,
            confidence=email.confidence,
        )
        self.applications.add(app)
        self._maybe_notify(app.user_id, app, job, new_status, created=False)
        return RoutedApplication(
            application_id=app.id,
            job_posting_id=app.job_posting_id,
            company=company,
            role=role,
            kind=email.kind,
            status=new_status.value,
            action="advanced",
            from_status=prior.value,
        )

    @staticmethod
    def _should_advance(current: ApplicationStatus, new: ApplicationStatus) -> bool:
        """Forward-only, with rejection terminal. Never un-reject; never downgrade."""
        if current == ApplicationStatus.REJECTED:
            return False  # terminal — a later stray email can't revive it
        if new == ApplicationStatus.REJECTED:
            return True   # rejection applies from any live stage
        return _STATUS_RANK[new] > _STATUS_RANK[current]

    def _best_application(
        self, email: JobEmail, user_apps: list[Application]
    ) -> Optional[tuple[Application, Optional[JobPosting]]]:
        """Pick the user's application that best matches this email, or None.

        A link match is accepted outright; otherwise a company match is required and
        a role match breaks ties. Returns the application and its posting."""
        best: Optional[tuple[Application, Optional[JobPosting]]] = None
        best_score = 0
        for app in user_apps:
            job = self.jobs.get(app.job_posting_id)
            score = 0
            if job is not None and _links_match(email.link, job.url):
                score = 5
            elif job is not None and email.company and _companies_match(email.company, job.company):
                score = 2 + (1 if email.role and _roles_match(email.role, job.title) else 0)
            if score > best_score:
                best, best_score = (app, job), score
        return best if best_score >= 2 else None

    def _best_posting(self, user_id: str, email: JobEmail) -> Optional[JobPosting]:
        """Find a known posting this email ties to (link, then company+role), so a new
        tracker row can be created against a real job. None when nothing ties."""
        if not email.link and not email.company:
            return None
        best: Optional[JobPosting] = None
        best_score = 0
        for job in self.jobs.find():
            score = 0
            if _links_match(email.link, job.url):
                score = 5
            elif email.company and _companies_match(email.company, job.company):
                score = 2 + (1 if email.role and _roles_match(email.role, job.title) else 0)
            if score > best_score:
                best, best_score = job, score
        return best if best_score >= 2 else None

    def _maybe_notify(
        self,
        user_id: str,
        app: Application,
        job: Optional[JobPosting],
        status: ApplicationStatus,
        *,
        created: bool,
    ) -> None:
        if status not in _NOTIFY_STATUSES:
            return
        where = (job.company if job else "") or "a tracked role"
        role = (job.title if job else "")
        what = "Interview" if status == ApplicationStatus.INTERVIEWING else "Offer"
        label = f"{role} at {where}".strip(" at").strip() if role else where
        self._notifier(Notification(
            user_id=user_id,
            type=NotificationType.SYSTEM,
            message=f"{what} update from your inbox — {label}",
        ))
