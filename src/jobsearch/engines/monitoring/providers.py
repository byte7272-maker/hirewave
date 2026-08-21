"""Exposure providers — the licensed-breach-intel boundary.

We never crawl the dark web or buy dumps ourselves (see
``docs/DARKWEB_MONITORING_PLAN.md``). Instead this port queries a provider that
collects breach data lawfully. ``MockExposureProvider`` is a deterministic
offline stand-in; ``HIBPExposureProvider`` calls the real Have I Been Pwned API
(needs ``HIBP_API_KEY``). Both return *categories* of exposed data, never secrets.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings
from jobsearch.models import Severity


@dataclass
class RawExposure:
    source_name: str  # e.g. "Acme Data Breach 2021"
    title: str
    exposed_data_types: list[str]  # categories: "email", "password", ...
    breach_date: str = ""
    severity: Severity = Severity.MEDIUM
    details: dict = field(default_factory=dict)


@runtime_checkable
class ExposureProvider(Protocol):
    name: str

    def check_email(self, email: str) -> list[RawExposure]: ...


def _severity_for(types: list[str]) -> Severity:
    t = {x.lower() for x in types}
    if t & {"password", "passwords", "credit card", "bank account", "ssn"}:
        return Severity.HIGH
    if t & {"phone", "phone numbers", "physical address", "date of birth"}:
        return Severity.MEDIUM
    return Severity.LOW


class MockExposureProvider:
    """Deterministic fake breach data — stable per email, for tests/offline."""

    name = "mock"

    _CATALOG = [
        ("Acme Data Breach 2021", ["email", "password"], "2021-03-14"),
        ("ShopFast Leak", ["email", "name", "phone"], "2019-11-02"),
        ("Newsletter Dump", ["email"], "2022-07-20"),
        ("Forum2000 Breach", ["email", "password", "ip address"], "2016-05-10"),
    ]

    def check_email(self, email: str) -> list[RawExposure]:
        local = email.split("@", 1)[0].lower()
        if local in {"clean", "safe", "none"}:  # handy for demos/tests
            return []
        h = int.from_bytes(hashlib.md5(email.lower().encode()).digest()[:4], "big")
        out: list[RawExposure] = []
        for i, (name, types, date) in enumerate(self._CATALOG):
            if (h >> i) & 1:
                out.append(
                    RawExposure(
                        source_name=name,
                        title=name,
                        exposed_data_types=types,
                        breach_date=date,
                        severity=_severity_for(types),
                        details={"provider": "mock"},
                    )
                )
        # Ensure a demo email surfaces at least one finding.
        if not out:
            name, types, date = self._CATALOG[0]
            out.append(
                RawExposure(name, name, types, date, _severity_for(types), {"provider": "mock"})
            )
        return out


class HIBPExposureProvider:
    """Live Have I Been Pwned breach lookup by email."""

    name = "hibp"

    def __init__(self, api_key: str, *, timeout: float = 15.0) -> None:
        self._key = api_key
        self._timeout = timeout

    def check_email(self, email: str) -> list[RawExposure]:  # pragma: no cover - network
        import urllib.parse

        import httpx

        url = (
            "https://haveibeenpwned.com/api/v3/breachedaccount/"
            f"{urllib.parse.quote(email)}?truncateResponse=false"
        )
        try:
            resp = httpx.get(
                url,
                headers={"hibp-api-key": self._key, "User-Agent": "JobSearchPlatform"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise RuntimeError(f"HIBP request failed: {exc}") from exc
        if resp.status_code == 404:
            return []  # no breaches found
        resp.raise_for_status()

        out: list[RawExposure] = []
        for b in resp.json():
            types = [d.lower() for d in b.get("DataClasses", [])]
            out.append(
                RawExposure(
                    source_name=b.get("Name", ""),
                    title=b.get("Title") or b.get("Name", ""),
                    exposed_data_types=types,
                    breach_date=b.get("BreachDate", ""),
                    severity=_severity_for(types),
                    details={"domain": b.get("Domain", "")},
                )
            )
        return out


def build_exposure_provider(settings: Optional[Settings] = None) -> ExposureProvider:
    s = settings or get_settings()
    if s.exposure_provider == "hibp" and s.hibp_api_key:
        return HIBPExposureProvider(s.hibp_api_key)
    return MockExposureProvider()


# --- Pwned Passwords (k-anonymity range API) --------------------------------
@runtime_checkable
class PwnedPasswordsRange(Protocol):
    """Returns the raw ``SUFFIX:COUNT`` range body for a 5-hex-char prefix."""

    def range(self, prefix5: str) -> str: ...


class PwnedPasswordsProvider:
    """Live HIBP Pwned Passwords range lookup (free, no API key).

    Privacy: the caller sends only the first 5 chars of a SHA-1 hash. This
    endpoint returns *every* suffix sharing that prefix (~500-1000), so the
    server never learns which password was checked. ``Add-Padding`` further
    obscures the true result count.
    """

    _URL = "https://api.pwnedpasswords.com/range/{prefix}"

    def __init__(self, *, timeout: float = 15.0) -> None:
        self._timeout = timeout

    def range(self, prefix5: str) -> str:  # pragma: no cover - network
        import httpx

        try:
            resp = httpx.get(
                self._URL.format(prefix=prefix5),
                headers={"Add-Padding": "true", "User-Agent": "JobSearchPlatform"},
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Pwned Passwords request failed: {exc}") from exc
        return resp.text


class MockPwnedPasswordsProvider:
    """Offline stand-in. Seeded suffixes let tests exercise the match path."""

    def __init__(self, seeded: Optional[dict[str, str]] = None) -> None:
        # prefix -> raw range body
        self._seeded = seeded or {}

    def range(self, prefix5: str) -> str:
        if prefix5 in self._seeded:
            return self._seeded[prefix5]
        # A little deterministic noise so "not found" is realistic.
        h = int.from_bytes(hashlib.md5(prefix5.encode()).digest()[:4], "big")
        return "\n".join(f"{h + i:035X}:{i + 1}" for i in range(3))


# Offline demo seed: the range bodies for a few notoriously-breached
# passwords, so the k-anonymity flow shows a realistic "found" result without
# reaching the network. Keyed by 5-hex SHA-1 prefix; each line is SUFFIX:COUNT.
_DEMO_PWNED_RANGES: dict[str, str] = {
    # "password"  -> SHA1 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    "5BAA6": "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\n"
    "003D68EB55068C33ACE09247EE4C639306B:3\n"
    "012C192B2F16F82EA0EB9EF18D9D539B0DD:1",
    # "123456"    -> SHA1 7C4A8D09CA3762AF61E59520943DC26494F8941B
    "7C4A8": "D09CA3762AF61E59520943DC26494F8941B:37359195\n"
    "0001E1F7A9C0F1E2D3B4A5968778695A6BC:2",
    # "qwerty"    -> SHA1 B1B3773A05C0ED0176787A4F1574FF0075F7521E
    "B1B37": "73A05C0ED0176787A4F1574FF0075F7521E:10190155\n"
    "0000A1B2C3D4E5F60718293A4B5C6D7E8F9:4",
}


def build_pwned_provider(settings: Optional[Settings] = None) -> PwnedPasswordsRange:
    """Live Pwned Passwords range when exposure monitoring is configured for
    HIBP; otherwise an offline mock seeded with real-world breach counts so the
    password check works without network access.
    """
    s = settings or get_settings()
    if s.exposure_provider == "hibp":
        return PwnedPasswordsProvider()
    return MockPwnedPasswordsProvider(seeded=_DEMO_PWNED_RANGES)
