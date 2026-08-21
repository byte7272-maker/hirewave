"""AssistantEngine — permission-gated automation with an audit trail."""

from __future__ import annotations

from typing import Optional

from jobsearch.engines.assistant.form_fill import FillPlan, FormField, FormFillEngine
from jobsearch.engines.assistant.live_fill import LiveFillEngine, LiveFillResult
from jobsearch.engines.automation.browser import BrowserDriver
from jobsearch.models import (
    AUTOMATION_SCOPES,
    AutomationAction,
    AutomationConsent,
    User,
    UserProfile,
)
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository


def demo_application_form() -> list[FormField]:
    """A representative application form (used when a real one isn't scraped),
    including credential + unknowable fields so the guardrails are visible."""
    return [
        FormField("full_name", "Full name", "text", True),
        FormField("email", "Email", "email", True),
        FormField("phone", "Phone", "tel"),
        FormField("location", "City / Location", "text"),
        FormField("linkedin", "LinkedIn URL", "url"),
        FormField("skills", "Key skills", "text"),
        FormField("salary", "Salary expectation", "text"),
        FormField("years_experience", "Years of experience", "number"),
        FormField("work_auth", "Are you authorized to work in this country?", "select"),
        FormField("cover", "Why do you want this role?", "textarea"),
        FormField("resume", "Résumé / CV", "file", True),
        FormField("account_password", "Create an account password", "password"),
        FormField("ssn", "SSN (for background check)", "text"),
    ]


class AssistantEngine:
    def __init__(
        self,
        *,
        consent: Optional[Repository[AutomationConsent]] = None,
        actions: Optional[Repository[AutomationAction]] = None,
        form_fill: Optional[FormFillEngine] = None,
    ) -> None:
        self.consent = consent or InMemoryRepository(id_attr="user_id")
        self.actions = actions or InMemoryRepository(id_attr="id")
        self.form_fill = form_fill or FormFillEngine()
        self._live = LiveFillEngine()

    # -- consent ------------------------------------------------------------
    def get_consent(self, user_id: str) -> AutomationConsent:
        return self.consent.get(user_id) or AutomationConsent(user_id=user_id, scopes=[])

    def set_consent(self, user_id: str, scopes: list[str]) -> AutomationConsent:
        valid = [s for s in scopes if s in AUTOMATION_SCOPES]
        con = self.get_consent(user_id)
        con.scopes = valid
        con.updated_at = utcnow()
        return self.consent.add(con)

    def has(self, user_id: str, scope: str) -> bool:
        return scope in self.get_consent(user_id).scopes

    # -- audit --------------------------------------------------------------
    def record(self, user_id: str, kind: str, *, job_id: Optional[str] = None, status: str = "proposed", detail: str = "") -> AutomationAction:
        return self.actions.add(AutomationAction(user_id=user_id, kind=kind, job_id=job_id, status=status, detail=detail))

    def actions_for(self, user_id: str, limit: int = 50) -> list[AutomationAction]:
        return sorted(self.actions.find(user_id=user_id), key=lambda a: a.created_at, reverse=True)[:limit]

    # -- auto form-fill -----------------------------------------------------
    def autofill(
        self,
        user: User,
        profile: UserProfile,
        fields: list[FormField],
        *,
        job_id: Optional[str] = None,
        resume_name: str = "",
        cover_text: str = "",
    ) -> FillPlan:
        plan = self.form_fill.plan(user, profile, fields, resume_name=resume_name, cover_text=cover_text)
        self.record(
            user.id, "autofill", job_id=job_id, status="proposed",
            detail=f"{plan.filled} auto-filled · {plan.needs_input} for you · {plan.blocked} refused (credentials)",
        )
        return plan

    # -- live browser fill --------------------------------------------------
    _STATUS_TO_AUDIT = {
        "submitted": "completed", "filled_pending_submit": "proposed",
        "needs_login": "blocked", "captcha": "blocked", "no_apply_button": "skipped",
        "needs_input": "proposed", "no_url": "skipped", "error": "blocked",
    }

    def execute_fill(
        self,
        user: User,
        plan: FillPlan,
        driver: BrowserDriver,
        *,
        url: str,
        submit: bool,
        job_id: Optional[str] = None,
        resume_name: str = "",
        resume_data: bytes = b"",
        live: bool = False,
        assisted: bool = False,
    ) -> LiveFillResult:
        result = self._live.execute(
            plan, driver, url=url, submit=submit,
            resume_name=resume_name, resume_data=resume_data, live=live, assisted=assisted,
        )
        where = "live browser" if live else "simulated"
        verb = "submit" if submit else "fill"
        self.record(
            user.id, "submit" if submit else "autofill", job_id=job_id,
            status=self._STATUS_TO_AUDIT.get(result.status, "proposed"),
            detail=f"{where} {verb}: {result.status} — {len(result.filled)} field(s) filled",
        )
        return result
