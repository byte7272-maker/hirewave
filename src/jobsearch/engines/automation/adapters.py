"""Platform-specific application adapters.

Each adapter knows how to submit to one destination (LinkedIn Easy Apply, Indeed
Apply, Greenhouse, Workday, or direct email). Two modes:

* ``simulate`` — the default; performs no network I/O and returns a synthetic
  success. This lets the whole automation pipeline (approval gate, audit trail,
  notifications) be exercised end-to-end without real accounts.
* ``live`` — where a real headless-browser / platform-API submission would run.
  These raise :class:`NotImplementedError` until the concrete integration
  (requiring the ``automation`` extra + credentials) is wired in.

The adapter contract is deliberately small so new platforms slot in cleanly
(section 9 risk mitigation: "abstract adapter pattern per platform").
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from jobsearch.models import Application, CoverLetter, JobPosting, Resume, User, UserProfile


@dataclass
class ApplicationContext:
    """Everything an adapter needs to submit one application."""

    application: Application
    job: JobPosting
    resume: Resume
    profile: UserProfile
    cover_letter: Optional[CoverLetter] = None
    #: The applicant (name/email/phone) — used to fill browser application forms.
    applicant: Optional[User] = None
    #: Decrypted OAuth access token for the destination, if applicable.
    access_token: Optional[str] = None
    extra: dict = field(default_factory=dict)


@dataclass
class SubmissionResult:
    success: bool
    platform: str
    confirmation_id: str = ""
    message: str = ""
    requires_manual: bool = False
    fallback_url: str = ""
    captcha_required: bool = False


class ApplicationAdapter(ABC):
    platform: str = "abstract"

    def __init__(self, mode: str = "simulate") -> None:
        self.mode = mode

    def supports(self, job: JobPosting) -> bool:
        """Whether this adapter can submit to the given posting's platform."""
        return job.source_platform.lower() == self.platform

    def submit(self, ctx: ApplicationContext) -> SubmissionResult:
        if self.mode == "simulate":
            return self._simulate(ctx)
        return self._submit_live(ctx)

    # -- to override --------------------------------------------------------
    def _simulate(self, ctx: ApplicationContext) -> SubmissionResult:
        return SubmissionResult(
            success=True,
            platform=self.platform,
            confirmation_id=f"sim-{self.platform}-{ctx.application.id[:8]}",
            message=f"[simulated] Application submitted via {self.platform}.",
        )

    def _submit_live(self, ctx: ApplicationContext) -> SubmissionResult:  # pragma: no cover
        raise NotImplementedError(
            f"Live submission for '{self.platform}' is not implemented. "
            "Install the `automation` extra and provide a real adapter."
        )

    def fallback_url(self, job: JobPosting) -> str:
        """A pre-filled link the user can use to finish manually on failure."""
        return job.url


class BrowserApplyAdapter(ApplicationAdapter):
    """Base for headless-browser quick-apply flows (LinkedIn / Indeed).

    Live submission drives a :class:`BrowserDriver`. Every unsafe/uncertain
    branch degrades to a **manual fallback** (or a CAPTCHA escalation) rather
    than risking a wrong or fabricated submission:

    * not authenticated → manual (we never enter the user's password)
    * CAPTCHA/security check → escalate to the user (we never solve it)
    * unknown required question → manual (we never invent answers)
    * apply button absent / driver error → manual

    Inject a driver for tests; in production it lazily builds a Playwright driver
    (which requires the ``automation`` extra + an authenticated ``storage_state``).
    """

    def __init__(
        self,
        mode: str = "simulate",
        *,
        driver=None,
        driver_factory=None,
        storage_state: Optional[str] = None,
        headless: bool = True,
    ) -> None:
        super().__init__(mode)
        self._driver = driver
        self._driver_factory = driver_factory
        self._storage_state = storage_state
        self._headless = headless

    def _make_driver(self):
        if self._driver_factory is not None:
            return self._driver_factory()
        from jobsearch.engines.automation.browser import PlaywrightDriver

        return PlaywrightDriver(
            platform=self.platform,
            storage_state=self._storage_state,
            headless=self._headless,
        )

    def _manual(self, ctx: "ApplicationContext", message: str) -> SubmissionResult:
        return SubmissionResult(
            success=False,
            platform=self.platform,
            message=message,
            requires_manual=True,
            fallback_url=self.fallback_url(ctx.job),
        )

    def _captcha(self, ctx: "ApplicationContext") -> SubmissionResult:
        return SubmissionResult(
            success=False,
            platform=self.platform,
            message=(
                "A CAPTCHA / security check was encountered — escalated to you to "
                "complete manually (we never solve CAPTCHAs)."
            ),
            requires_manual=True,
            captcha_required=True,
            fallback_url=self.fallback_url(ctx.job),
        )

    def _submit_live(self, ctx: "ApplicationContext") -> SubmissionResult:
        from jobsearch.engines.automation.browser import application_fields

        driver = self._driver or self._make_driver()  # may raise if Playwright absent
        fields = application_fields(ctx)
        try:
            driver.start()
            driver.open(ctx.job.url or "")

            if driver.needs_login():
                return self._manual(
                    ctx, f"not signed in to {self.platform} — authenticate that account first"
                )
            if driver.has_captcha():
                return self._captcha(ctx)
            if not driver.start_apply():
                return self._manual(
                    ctx, f"quick apply is not available for this posting on {self.platform}"
                )

            outcome = driver.fill_application(fields)
            if outcome.captcha:
                return self._captcha(ctx)
            if outcome.unknown_required:
                asked = ", ".join(outcome.unknown_required[:5])
                return self._manual(
                    ctx,
                    "this application asks questions we won't answer on your behalf "
                    f"({asked}) — please finish it manually",
                )

            rf = ctx.extra.get("resume_file")
            if rf and rf.get("data"):
                driver.upload_resume(rf.get("filename") or "resume", rf["data"])
            elif ctx.resume and ctx.resume.rendered_text:
                driver.upload_resume("resume.md", ctx.resume.rendered_text.encode("utf-8"))

            confirmation = driver.finalize()
            return SubmissionResult(
                success=True,
                platform=self.platform,
                confirmation_id=confirmation,
                message=f"Submitted via {self.platform} quick apply.",
            )
        finally:
            try:
                driver.close()
            except Exception:  # noqa: BLE001
                pass


class LinkedInAdapter(BrowserApplyAdapter):
    platform = "linkedin"


class IndeedAdapter(BrowserApplyAdapter):
    platform = "indeed"


class GreenhouseAdapter(ApplicationAdapter):
    platform = "greenhouse"


class WorkdayAdapter(ApplicationAdapter):
    platform = "workday"


class EmailAdapter(ApplicationAdapter):
    """Direct application by email — the safest live channel.

    Live sends go through the user's connected Gmail (``ctx.access_token`` is the
    decrypted Gmail bearer token, populated by the API layer from the integration
    engine). The cover letter becomes the email body and the résumé is attached.
    The engine's approval gate guarantees this only runs on user-approved
    documents.
    """

    platform = "email"

    def __init__(self, mode: str = "simulate", *, gmail_client=None) -> None:
        super().__init__(mode)
        self._gmail = gmail_client

    def supports(self, job: JobPosting) -> bool:
        # Email is a universal fallback; usable whenever an application address
        # (or a company domain to derive one) is available.
        return (
            job.source_platform.lower() == self.platform
            or bool(job.application_email)
            or bool(job.company_domain)
        )

    def _recipient(self, ctx: ApplicationContext) -> str:
        return (
            ctx.extra.get("to")
            or ctx.job.application_email
            or (f"careers@{ctx.job.company_domain}" if ctx.job.company_domain else "")
        )

    def _simulate(self, ctx: ApplicationContext) -> SubmissionResult:
        to = self._recipient(ctx) or "careers@example.com"
        return SubmissionResult(
            success=True,
            platform=self.platform,
            confirmation_id=f"sim-email-{ctx.application.id[:8]}",
            message=f"[simulated] Application emailed to {to}.",
        )

    def _submit_live(self, ctx: ApplicationContext) -> SubmissionResult:
        from jobsearch.engines.automation.gmail import (
            Attachment,
            GmailClient,
            build_raw_message,
        )

        if not ctx.access_token:
            raise RuntimeError(
                "live email submission requires a connected Gmail access token "
                "(connect Gmail in integrations)"
            )
        to = self._recipient(ctx)
        if not to:
            raise RuntimeError("no application email address available for this posting")

        candidate = ctx.profile.headline or ctx.application.user_id
        subject = f"Application for {ctx.job.title or 'the role'} — {candidate}"
        body = (
            ctx.cover_letter.content
            if ctx.cover_letter and ctx.cover_letter.content
            else "Please find my application and résumé attached."
        )
        # Prefer the user's uploaded résumé file; fall back to the generated markdown.
        rf = ctx.extra.get("resume_file")
        if rf and rf.get("data"):
            maintype, _, subtype = (rf.get("content_type") or "application/octet-stream").partition("/")
            attachments = [
                Attachment(
                    filename=rf.get("filename") or "resume",
                    data=rf["data"],
                    maintype=maintype or "application",
                    subtype=subtype or "octet-stream",
                )
            ]
        else:
            attachments = [
                Attachment(
                    filename="resume.md",
                    data=(ctx.resume.rendered_text or "").encode("utf-8"),
                    maintype="text",
                    subtype="markdown",
                )
            ]
        raw = build_raw_message(to=to, subject=subject, body=body, attachments=attachments)

        client = self._gmail or GmailClient()
        resp = client.send_raw(ctx.access_token, raw)
        return SubmissionResult(
            success=True,
            platform=self.platform,
            confirmation_id=resp.get("id", ""),
            message=f"Application emailed to {to} via Gmail.",
        )
