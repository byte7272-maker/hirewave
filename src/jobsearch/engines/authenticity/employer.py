"""Employer-site verification — is the posting really available at the source?

A ``EmployerVerifier`` checks whether a job is still listed on the employer's own
domain / posting URL. The offline ``MockEmployerVerifier`` uses deterministic
heuristics; ``HttpEmployerVerifier`` actually fetches the URL (best-effort — a
signal, not proof). Never raises into the flow; anything uncertain is UNKNOWN.
"""

from __future__ import annotations

import re
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings
from jobsearch.models import EmployerStatus, JobPosting

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly")


@runtime_checkable
class EmployerVerifier(Protocol):
    @property
    def name(self) -> str: ...

    def check(self, job: JobPosting) -> tuple[EmployerStatus, str]: ...


class MockEmployerVerifier:
    """Deterministic offline check — flags the tell-tale signs a real employer
    check would catch (link shorteners, no verifiable company domain)."""

    name = "mock"

    def check(self, job: JobPosting) -> tuple[EmployerStatus, str]:
        url = (job.url or "").lower()
        domain = (job.company_domain or "").strip().lower()
        if url and any(s in url for s in _SHORTENERS):
            return EmployerStatus.NOT_FOUND, "Posting hides behind a link shortener — not confirmable on an employer site"
        if not domain:
            return EmployerStatus.INVALID_DOMAIN, "No verifiable employer domain on the posting"
        if not url:
            return EmployerStatus.UNKNOWN, "No posting URL to check"
        return EmployerStatus.LISTED, f"Consistent with {domain}"


class HttpEmployerVerifier:
    """Fetches the posting URL to confirm it still resolves and mentions the role."""

    name = "http"

    def __init__(self, *, timeout: float = 15.0) -> None:
        self._timeout = timeout

    def check(self, job: JobPosting) -> tuple[EmployerStatus, str]:  # pragma: no cover - network
        import httpx

        url = (job.url or "").strip()
        if not url:
            if not (job.company_domain or "").strip():
                return EmployerStatus.INVALID_DOMAIN, "No URL or company domain to check"
            return EmployerStatus.UNKNOWN, "No posting URL to check"
        try:
            resp = httpx.get(url, timeout=self._timeout, follow_redirects=True, headers={"User-Agent": "JobSearchPlatform/verify"})
        except httpx.ConnectError:
            return EmployerStatus.INVALID_DOMAIN, "Employer domain does not resolve"
        except httpx.HTTPError as exc:
            return EmployerStatus.UNKNOWN, f"Could not reach the posting ({exc})"
        if resp.status_code in (404, 410):
            return EmployerStatus.NOT_FOUND, f"Posting returns {resp.status_code} — expired or removed"
        if resp.status_code >= 400:
            return EmployerStatus.UNKNOWN, f"Posting returned HTTP {resp.status_code}"
        # Loose confirmation: the role's key words appear on the page.
        body = resp.text.lower()
        tokens = [t for t in re.split(r"[^a-z0-9]+", (job.title or "").lower()) if len(t) > 3]
        if tokens and not any(t in body for t in tokens):
            return EmployerStatus.NOT_FOUND, "Page no longer mentions this role"
        return EmployerStatus.LISTED, "Posting is live at the source URL"


def build_employer_verifier(settings: Optional[Settings] = None) -> EmployerVerifier:
    s = settings or get_settings()
    if s.employer_verifier == "http":
        return HttpEmployerVerifier(timeout=s.employer_verifier_timeout_seconds)
    return MockEmployerVerifier()
