"""AutomationEngine — orchestrate reviewed-and-approved submissions.

Enforces the platform's safety controls (section 6.5):

* **Approval gate** — resume *and* cover letter (when present) must be
  ``approved`` or submission is refused. No batch auto-submit.
* **Rate limiting** — a per-user sliding window caps submissions to avoid
  triggering platform account flags/bans.
* **Audit trail** — every attempt is appended to the Application record.
* **Fallback** — on failure the user gets a pre-filled link + manual steps.
* **CAPTCHA** — escalated to the user rather than solved automatically.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Callable, Optional

from jobsearch.config import Settings, get_settings
from jobsearch.engines.automation.adapters import (
    ApplicationAdapter,
    ApplicationContext,
    EmailAdapter,
    GreenhouseAdapter,
    IndeedAdapter,
    LinkedInAdapter,
    SubmissionResult,
    WorkdayAdapter,
)
from jobsearch.models import Application, ApplicationStatus, Notification
from jobsearch.models.common import utcnow
from jobsearch.models.notification import NotificationType


class ApprovalRequiredError(RuntimeError):
    """Raised when submission is attempted before user approval."""


class NoAdapterError(RuntimeError):
    """Raised when no adapter can handle the posting's platform."""


class RateLimitError(RuntimeError):
    """Raised when a user exceeds the submission rate limit."""


class _RateLimiter:
    """Simple per-user sliding-window limiter."""

    def __init__(self, max_actions: int, window_seconds: float) -> None:
        self.max_actions = max_actions
        self.window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check_and_record(self, user_id: str) -> None:
        now = utcnow().timestamp()
        q = self._events[user_id]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.max_actions:
            raise RateLimitError(
                f"submission rate limit reached ({self.max_actions} per "
                f"{int(self.window)}s) — try again later"
            )
        q.append(now)


class AutomationEngine:
    def __init__(
        self,
        *,
        adapters: Optional[list[ApplicationAdapter]] = None,
        settings: Optional[Settings] = None,
        max_submissions_per_hour: int = 15,
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.settings = settings or get_settings()
        mode = self.settings.automation_mode
        self.adapters: list[ApplicationAdapter] = adapters or [
            LinkedInAdapter(mode),
            IndeedAdapter(mode),
            GreenhouseAdapter(mode),
            WorkdayAdapter(mode),
            EmailAdapter(mode),
        ]
        self._limiter = _RateLimiter(max_submissions_per_hour, 3600.0)
        self._notifier = notifier

    def select_adapter(self, ctx: ApplicationContext) -> Optional[ApplicationAdapter]:
        explicit = ctx.extra.get("platform")
        for adapter in self.adapters:
            if explicit and adapter.platform == explicit:
                return adapter
        for adapter in self.adapters:
            if adapter.supports(ctx.job):
                return adapter
        return None

    def submit(self, ctx: ApplicationContext) -> SubmissionResult:
        app = ctx.application

        # 1. Human-in-the-loop approval gate.
        if not ctx.resume.approved:
            raise ApprovalRequiredError("resume must be user-approved before submission")
        if ctx.cover_letter is not None and not ctx.cover_letter.approved:
            raise ApprovalRequiredError("cover letter must be user-approved before submission")

        # 2. Adapter selection.
        adapter = self.select_adapter(ctx)
        if adapter is None:
            raise NoAdapterError(
                f"no automation adapter supports platform '{ctx.job.source_platform}'"
            )

        # 3. Rate limiting (records the attempt).
        self._limiter.check_and_record(app.user_id)

        app.record_event("submit_attempt", platform=adapter.platform)

        # 4. Attempt submission; convert failures into a manual fallback.
        try:
            result = adapter.submit(ctx)
        except NotImplementedError as exc:
            result = SubmissionResult(
                success=False,
                platform=adapter.platform,
                message=str(exc),
                requires_manual=True,
                fallback_url=adapter.fallback_url(ctx.job),
            )
        except Exception as exc:  # noqa: BLE001 - surface any adapter failure as fallback
            result = SubmissionResult(
                success=False,
                platform=adapter.platform,
                message=f"automation error: {exc}",
                requires_manual=True,
                fallback_url=adapter.fallback_url(ctx.job),
            )

        # 5. CAPTCHA escalation is a manual step, not a failure to hide.
        if result.captcha_required:
            result.requires_manual = True
            result.fallback_url = result.fallback_url or adapter.fallback_url(ctx.job)

        self._finalize(ctx, adapter, result)
        return result

    def _finalize(
        self,
        ctx: ApplicationContext,
        adapter: ApplicationAdapter,
        result: SubmissionResult,
    ) -> None:
        app = ctx.application
        if result.success:
            app.status = ApplicationStatus.SUBMITTED
            app.submitted_at = utcnow()
            app.platform_response = {
                "confirmation_id": result.confirmation_id,
                "message": result.message,
            }
            app.record_event(
                "submitted", platform=adapter.platform, confirmation_id=result.confirmation_id
            )
            self._notify(
                app.user_id,
                NotificationType.APPLICATION_SUBMITTED,
                f"Application to {ctx.job.company or 'the company'} submitted via {adapter.platform}.",
            )
        else:
            app.platform_response = {
                "error": result.message,
                "fallback_url": result.fallback_url,
                "manual_steps": self.manual_steps(ctx, adapter),
            }
            app.record_event("submit_failed", platform=adapter.platform, error=result.message)
            self._notify(
                app.user_id,
                NotificationType.APPLICATION_FAILED,
                f"Automated submission failed — finish manually: {result.fallback_url}",
            )
        app.updated_at = utcnow()

    @staticmethod
    def manual_steps(ctx: ApplicationContext, adapter: ApplicationAdapter) -> list[str]:
        """One-click-style instructions for the fallback path (section 6.5)."""
        return [
            f"Open the posting: {adapter.fallback_url(ctx.job)}",
            "Upload the approved resume from your dashboard (already generated).",
            "Paste the approved cover letter." if ctx.cover_letter else "Complete the short form.",
            "Submit and mark the application as 'submitted' in your dashboard.",
        ]

    def _notify(self, user_id: str, type_: NotificationType, message: str) -> None:
        if self._notifier is None:
            return
        self._notifier(Notification(user_id=user_id, type=type_, message=message))
