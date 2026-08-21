"""Drive a real browser to fill (and optionally submit) an application form from
a reviewed fill plan.

Safety, enforced here regardless of the plan:

* **Only ``filled`` non-credential values reach the browser.** ``blocked``
  (credential) entries are structurally excluded — the driver never receives a
  password/SSN/etc.
* **The user's own session.** The driver operates on a browser context the user
  authenticated themselves (a Playwright ``storage_state``); a login wall or
  CAPTCHA is *detected and escalated*, never solved or bypassed.
* **Approval gate.** ``submit`` only clicks the final button when the caller
  passed it (the ``submit_after_review`` scope + explicit approval).

``MockBrowserDriver`` makes the whole flow demoable/testable offline; the real
``PlaywrightDriver`` is selected when ``assistant_browser=playwright``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from jobsearch.config import Settings, get_settings
from jobsearch.engines.assistant.form_fill import FillPlan
from jobsearch.engines.automation.browser import BrowserDriver, FillOutcome


@dataclass
class LiveFillResult:
    status: str  # see below
    filled: list[str] = field(default_factory=list)
    unknown_required: list[str] = field(default_factory=list)
    confirmation: str = ""
    detail: str = ""
    live: bool = False  # True when a real browser ran (vs the mock)


# status values:
#   submitted            — form filled AND the final submit was clicked
#   filled_pending_submit — filled; waiting for the user to approve/submit
#   needs_login          — a login wall; the user must sign in themselves first
#   captcha              — a human check appeared; the user must resolve it
#   no_apply_button      — no apply control found on the page
#   needs_input          — required questions we won't answer; user must finish
#   no_url               — the posting has no application URL
#   error                — driver error


def _canonical_key(field: str, label: str) -> str:
    """Map a form field to the canonical key the real driver fills."""
    key = f"{field} {label}".lower()
    if "email" in key:
        return "email"
    if "phone" in key or "mobile" in key or "telephone" in key:
        return "phone"
    if "name" in key:
        return "name"
    if "location" in key or "city" in key or "address" in key:
        return "location"
    return field


class MockBrowserDriver:
    """Offline stand-in — simulates a clean fill so the flow is demoable/testable."""

    def __init__(self, *, needs_login: bool = False, captcha: bool = False, can_apply: bool = True) -> None:
        self._needs_login = needs_login
        self._captcha = captcha
        self._can_apply = can_apply
        self._fields: dict[str, str] = {}

    def start(self) -> None: ...
    def open(self, url: str) -> None: ...
    def needs_login(self) -> bool: return self._needs_login
    def has_captcha(self) -> bool: return self._captcha
    def start_apply(self) -> bool: return self._can_apply

    def fill_application(self, fields: dict[str, str]) -> FillOutcome:
        self._fields = dict(fields)
        return FillOutcome(filled=list(fields.keys()))

    def upload_resume(self, filename: str, data: bytes) -> bool: return bool(filename)
    def finalize(self) -> str: return "mock-submitted"
    def close(self) -> None: ...


def build_browser_driver(
    settings: Optional[Settings] = None, *, platform: str = "", storage_state: str = ""
) -> tuple[BrowserDriver, bool]:
    """Return ``(driver, is_live)``. Playwright when configured *and* a session
    is available (a connected ``storage_state`` for this user/provider, or the
    config path), else the offline mock.

    ``storage_state`` (raw JSON from a connected :class:`BrowserSession`) takes
    precedence over the static ``assistant_browser_storage_state`` path.
    """
    s = settings or get_settings()
    state = storage_state or s.assistant_browser_storage_state
    if s.assistant_browser == "playwright" and state:  # pragma: no cover - real browser
        from jobsearch.engines.automation.browser import PlaywrightDriver

        driver = PlaywrightDriver(
            platform=platform or "linkedin",
            storage_state=state,
            headless=s.assistant_browser_headless,
        )
        return driver, True
    return MockBrowserDriver(), False


class LiveFillEngine:
    def execute(
        self,
        plan: FillPlan,
        driver: BrowserDriver,
        *,
        url: str,
        submit: bool = False,
        resume_name: str = "",
        resume_data: bytes = b"",
        live: bool = False,
        assisted: bool = False,
    ) -> LiveFillResult:
        """Fill (and optionally submit) an application form.

        When ``assisted`` is True the user has already clicked the provider's
        Apply button, so the form is open — we skip the Apply click and go
        straight to filling. Used for ToS-sensitive providers where a human
        initiates every application (LinkedIn).
        """
        if not url:
            return LiveFillResult("no_url", detail="This posting has no application URL to open.", live=live)

        # ONLY non-credential, actually-filled values ever reach the browser,
        # keyed canonically so the real driver's label matching works.
        values: dict[str, str] = {}
        for e in plan.entries:
            if e.status == "filled" and e.value:
                values[_canonical_key(e.field, e.label)] = e.value

        try:
            driver.start()
            driver.open(url)
            if driver.needs_login():
                return LiveFillResult("needs_login", live=live,
                                      detail="A sign-in wall appeared — log in to the provider yourself, then retry. We never enter your password.")
            if driver.has_captcha():
                return LiveFillResult("captcha", live=live,
                                      detail="A human-verification check appeared — please solve it, then retry. We never bypass these.")
            # In assisted mode the human already clicked Apply, so the form is
            # open — don't click it ourselves. Otherwise we open it.
            if not assisted and not driver.start_apply():
                return LiveFillResult("no_apply_button", live=live,
                                      detail="Couldn't find an apply button on the page — apply manually from the posting.")
            outcome = driver.fill_application(values)
            if outcome.captcha:
                return LiveFillResult("captcha", filled=outcome.filled, live=live,
                                      detail="A check appeared mid-form — please finish in the browser.")
            if resume_name and resume_data:
                driver.upload_resume(resume_name, resume_data)
            if outcome.unknown_required:
                return LiveFillResult("needs_input", filled=outcome.filled, unknown_required=outcome.unknown_required, live=live,
                                      detail="Some required questions need your answers — finish them in the browser.")
            if not submit:
                return LiveFillResult("filled_pending_submit", filled=outcome.filled, live=live,
                                      detail="Form filled — review it, then submit yourself or approve submission.")
            confirmation = driver.finalize()
            return LiveFillResult("submitted", filled=outcome.filled, confirmation=confirmation, live=live,
                                  detail="Application submitted.")
        except Exception as exc:  # noqa: BLE001 - never let a driver error crash the request
            return LiveFillResult("error", detail=str(exc), live=live)
        finally:
            try:
                driver.close()
            except Exception:  # noqa: BLE001
                pass
