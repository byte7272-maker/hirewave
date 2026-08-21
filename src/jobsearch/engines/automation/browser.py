"""Headless-browser driver for LinkedIn Easy Apply / Indeed Apply.

Safety model (this is ToS-sensitive automation — see the plan's risk register):

* **No credentials.** The driver never types the user's password. It operates on
  a browser context the user has *already* authenticated (a Playwright
  ``storage_state`` the user established themselves). A login wall → escalate.
* **No CAPTCHA solving.** Challenges are *detected* and escalated to the user for
  manual resolution — never solved or bypassed.
* **No fabrication.** Only factual, known profile fields are filled. Any *unknown
  required* question aborts to a manual fallback rather than guessing an answer
  (upholds the platform's authenticity-first principle).
* **Rate limiting + audit + approval gate** are enforced by the AutomationEngine
  around every call.

``BrowserDriver`` is a port; ``PlaywrightDriver`` is the real implementation
(lazy-imports Playwright), and tests inject a fake — so all the safety
*orchestration* is verified offline, without a browser or a real account.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Protocol, runtime_checkable

if TYPE_CHECKING:  # avoid a runtime import cycle with adapters.py
    from jobsearch.engines.automation.adapters import ApplicationContext


@dataclass
class FillOutcome:
    """Result of filling a (possibly multi-step) application form."""

    filled: list[str] = field(default_factory=list)
    #: Required questions we could not map to factual profile data. Non-empty →
    #: the adapter aborts to a manual fallback rather than fabricating answers.
    unknown_required: list[str] = field(default_factory=list)
    captcha: bool = False


@runtime_checkable
class BrowserDriver(Protocol):
    def start(self) -> None: ...
    def open(self, url: str) -> None: ...
    def needs_login(self) -> bool: ...
    def has_captcha(self) -> bool: ...
    def start_apply(self) -> bool: ...  # click Easy Apply / Apply; False if absent
    def fill_application(self, fields: dict[str, str]) -> FillOutcome: ...
    def upload_resume(self, filename: str, data: bytes) -> bool: ...
    def finalize(self) -> str: ...  # click final submit; return a confirmation string
    def close(self) -> None: ...


def application_fields(ctx: "ApplicationContext") -> dict[str, str]:
    """Extract only factual, known fields to fill — never invented data."""
    out: dict[str, str] = {}
    applicant = ctx.applicant
    if applicant is not None:
        if applicant.full_name:
            out["name"] = applicant.full_name
        if applicant.email:
            out["email"] = applicant.email
        if applicant.phone:
            out["phone"] = applicant.phone
        if applicant.location:
            out["location"] = applicant.location
    # Location can also come from the profile's preferences if not on the user.
    if "location" not in out and ctx.profile.preferences.target_locations:
        out["location"] = ctx.profile.preferences.target_locations[0]
    return out


class PlaywrightDriver:
    """Best-effort Playwright implementation.

    ⚠️ The DOM selectors below are best-effort and will drift as the sites
    change — they need validation against real accounts. The adapter's
    safety bail-outs (login/CAPTCHA/unknown-field → manual) mean drift degrades
    to a manual fallback rather than a wrong submission.
    """

    #: Per-platform "apply" button texts, tried in order.
    APPLY_TEXTS = {
        "linkedin": ["Easy Apply"],
        "indeed": ["Apply now", "Indeed Apply", "Apply on company site"],
    }
    _NEXT_TEXTS = ["Next", "Continue", "Review", "Review your application"]
    _SUBMIT_TEXTS = ["Submit application", "Submit", "Send application"]
    _CAPTCHA_HINTS = ["captcha", "recaptcha", "hcaptcha", "verify you are human", "security check"]

    def __init__(
        self,
        *,
        platform: str,
        storage_state: Optional[str] = None,
        headless: bool = True,
        timeout_ms: int = 15000,
        max_steps: int = 8,
    ) -> None:
        try:
            from playwright.sync_api import sync_playwright  # noqa: F401
        except ImportError as exc:  # pragma: no cover - depends on the `automation` extra
            raise RuntimeError(
                "playwright not installed — run `pip install .[automation]` "
                "and `playwright install chromium`"
            ) from exc
        self.platform = platform
        self._storage_state = storage_state
        self._headless = headless
        self._timeout = timeout_ms
        self._max_steps = max_steps
        self._pw = None
        self._browser = None
        self._ctx = None
        self.page = None

    # -- lifecycle ----------------------------------------------------------
    def start(self) -> None:  # pragma: no cover - needs a real browser
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self._headless)
        # storage_state may be a file path OR raw JSON (from a connected
        # BrowserSession). Playwright accepts a path (str) or a parsed dict.
        state = self._storage_state
        if isinstance(state, str) and state.strip().startswith("{"):
            import json

            state = json.loads(state)
        self._ctx = self._browser.new_context(storage_state=state or None)
        self.page = self._ctx.new_page()
        self.page.set_default_timeout(self._timeout)

    def open(self, url: str) -> None:  # pragma: no cover
        self.page.goto(url, wait_until="domcontentloaded")

    def close(self) -> None:  # pragma: no cover
        for obj in (self._ctx, self._browser, self._pw):
            try:
                obj.close() if obj is not self._pw else obj.stop()
            except Exception:  # noqa: BLE001
                pass

    # -- detection ----------------------------------------------------------
    def needs_login(self) -> bool:  # pragma: no cover
        url = (self.page.url or "").lower()
        if "/login" in url or "/authwall" in url or "signin" in url:
            return True
        # A visible password field is a strong login-wall signal.
        try:
            return self.page.locator("input[type=password]").first.is_visible()
        except Exception:  # noqa: BLE001
            return False

    def has_captcha(self) -> bool:  # pragma: no cover
        try:
            html = (self.page.content() or "").lower()
        except Exception:  # noqa: BLE001
            return False
        return any(hint in html for hint in self._CAPTCHA_HINTS)

    # -- apply flow ---------------------------------------------------------
    def start_apply(self) -> bool:  # pragma: no cover
        for text in self.APPLY_TEXTS.get(self.platform, []):
            btn = self.page.get_by_role("button", name=text)
            if btn.count() and btn.first.is_enabled():
                btn.first.click()
                return True
        return False

    def fill_application(self, fields: dict[str, str]) -> FillOutcome:  # pragma: no cover
        outcome = FillOutcome()
        for _ in range(self._max_steps):
            if self.has_captcha():
                outcome.captcha = True
                return outcome
            self._fill_visible_known(fields, outcome)
            unknown = self._unfilled_required()
            if unknown:
                outcome.unknown_required = unknown
                return outcome
            if not self._advance():  # no Next/Continue → we're at the submit step
                return outcome
        return outcome

    def _fill_visible_known(self, fields: dict[str, str], outcome: FillOutcome) -> None:
        label_map = {
            "email": ["email"],
            "phone": ["phone", "mobile"],
            "name": ["name", "full name"],
            "location": ["location", "city"],
        }
        for key, needles in label_map.items():
            value = fields.get(key)
            if not value:
                continue
            for needle in needles:
                loc = self.page.get_by_label(needle, exact=False)
                if loc.count():
                    try:
                        loc.first.fill(value)
                        outcome.filled.append(key)
                        break
                    except Exception:  # noqa: BLE001
                        continue

    def _unfilled_required(self) -> list[str]:
        unknown: list[str] = []
        try:
            required = self.page.locator("[required]")
            for i in range(min(required.count(), 20)):
                el = required.nth(i)
                if el.is_visible() and not (el.input_value() or "").strip():
                    unknown.append(el.get_attribute("name") or el.get_attribute("aria-label") or "field")
        except Exception:  # noqa: BLE001
            pass
        return unknown

    def _advance(self) -> bool:
        for text in self._NEXT_TEXTS:
            btn = self.page.get_by_role("button", name=text)
            if btn.count() and btn.first.is_enabled():
                btn.first.click()
                return True
        return False

    def upload_resume(self, filename: str, data: bytes) -> bool:  # pragma: no cover
        try:
            file_input = self.page.locator("input[type=file]")
            if not file_input.count():
                return False
            file_input.first.set_input_files(
                files=[{"name": filename, "mimeType": "text/markdown", "buffer": data}]
            )
            return True
        except Exception:  # noqa: BLE001
            return False

    def finalize(self) -> str:  # pragma: no cover
        for text in self._SUBMIT_TEXTS:
            btn = self.page.get_by_role("button", name=text)
            if btn.count() and btn.first.is_enabled():
                btn.first.click()
                return f"{self.platform}-submitted"
        raise RuntimeError("no submit control found on the final step")
