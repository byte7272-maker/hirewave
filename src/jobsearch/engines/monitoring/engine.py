"""MonitoringEngine — enroll, verify ownership, scan, and alert.

Safety model (see ``docs/DARKWEB_MONITORING_PLAN.md``):

* **Ownership verification** — an identifier is never queried until the user
  proves control of it with a one-time code.
* **Encryption** — the real value is AES-256-GCM encrypted (bound to the user);
  only a one-way hash and a masked label are kept in the clear.
* **No secrets stored** — findings record *what category* leaked and *where*,
  never the leaked value.
* **Alerts** — each new finding raises a ``SECURITY_EXPOSURE`` notification.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Callable, Optional

from jobsearch.config import Settings, get_settings
from jobsearch.engines.monitoring.providers import (
    ExposureProvider,
    PwnedPasswordsRange,
    build_exposure_provider,
    build_pwned_provider,
)
from jobsearch.models import (
    ExposureFinding,
    IdentifierType,
    MonitoredIdentifier,
    Notification,
    NotificationType,
)
from jobsearch.models.common import utcnow
from jobsearch.security.crypto import FieldCipher
from jobsearch.store import InMemoryRepository, Repository


def _normalize(email: str) -> str:
    return email.strip().lower()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return (local[:1] or "*") + "***"
    shown = local[:1] if local else ""
    return f"{shown}{'*' * max(2, len(local) - 1)}@{domain}"


class MonitoringEngine:
    def __init__(
        self,
        *,
        identifiers: Optional[Repository[MonitoredIdentifier]] = None,
        findings: Optional[Repository[ExposureFinding]] = None,
        cipher: Optional[FieldCipher] = None,
        provider: Optional[ExposureProvider] = None,
        pwned: Optional[PwnedPasswordsRange] = None,
        notifier: Optional[Callable[[Notification], None]] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.identifiers = identifiers or InMemoryRepository(id_attr="id")
        self.findings = findings or InMemoryRepository(id_attr="id")
        self.cipher = cipher or FieldCipher()
        self.provider = provider or build_exposure_provider(self.settings)
        self.pwned = pwned or build_pwned_provider(self.settings)
        self._notifier = notifier

    # -- enrollment + verification -----------------------------------------
    def enroll(self, user_id: str, email: str) -> tuple[MonitoredIdentifier, Optional[str]]:
        """Enroll an email for monitoring and issue a verification code.

        Returns ``(identifier, code)``. The code must be delivered to the user
        out-of-band (emailed in production); an already-verified identifier
        returns ``code=None``.
        """
        norm = _normalize(email)
        vh = _hash(norm)
        existing = [
            i for i in self.identifiers.find(user_id=user_id, value_hash=vh)
        ]
        if not existing:
            count = len(self.identifiers.find(user_id=user_id))
            if count >= self.settings.monitoring_max_identifiers:
                raise ValueError(
                    f"monitoring limit reached ({self.settings.monitoring_max_identifiers} "
                    "identifiers)"
                )
        ident = existing[0] if existing else MonitoredIdentifier(
            user_id=user_id,
            type=IdentifierType.EMAIL,
            value=self.cipher.encrypt(norm, aad=user_id),
            value_hash=vh,
            label=mask_email(norm),
        )
        if ident.verified:
            return ident, None

        code = f"{secrets.randbelow(1_000_000):06d}"
        ident.code_hash = _hash(code)
        ident.code_expires_at = utcnow() + timedelta(minutes=self.settings.verification_ttl_minutes)
        ident.attempts = 0
        self.identifiers.add(ident)
        return ident, code

    def verify(self, ident: MonitoredIdentifier, code: str) -> bool:
        if ident.verified:
            return True
        if ident.code_expires_at is None or utcnow() > ident.code_expires_at:
            return False
        if ident.attempts >= 5:
            return False
        ident.attempts += 1
        ok = secrets.compare_digest(ident.code_hash, _hash(code))
        if ok:
            ident.verified = True
            ident.verified_at = utcnow()
            ident.code_hash = ""
            ident.code_expires_at = None
        self.identifiers.add(ident)
        return ok

    # -- scanning + alerting -----------------------------------------------
    def scan(self, user_id: str) -> list[ExposureFinding]:
        """Check every *verified* identifier and record any new exposures."""
        new: list[ExposureFinding] = []
        for ident in self.identifiers.find(user_id=user_id):
            if not ident.verified:
                continue
            email = self.cipher.decrypt(ident.value, aad=user_id)
            seen = {f.source for f in self.findings.find(identifier_id=ident.id)}
            for raw in self.provider.check_email(email):
                source = f"{self.provider.name}:{raw.source_name}"
                if source in seen:
                    continue
                finding = ExposureFinding(
                    user_id=user_id,
                    identifier_id=ident.id,
                    source=source,
                    title=raw.title,
                    exposed_data_types=raw.exposed_data_types,
                    breach_date=raw.breach_date,
                    severity=raw.severity,
                    details=raw.details,
                )
                self.findings.add(finding)
                new.append(finding)
                self._alert(user_id, ident, finding)
        return new

    def _alert(self, user_id: str, ident: MonitoredIdentifier, finding: ExposureFinding) -> None:
        if self._notifier is None:
            return
        cats = ", ".join(finding.exposed_data_types) or "account data"
        self._notifier(
            Notification(
                user_id=user_id,
                type=NotificationType.SECURITY_EXPOSURE,
                message=(
                    f"{ident.label} was found in “{finding.title}” (exposed: {cats}). "
                    "Change any reused passwords and enable MFA on affected accounts."
                ),
            )
        )

    # -- password exposure (k-anonymity, nothing stored) -------------------
    def password_range(self, prefix5: str) -> str:
        """Proxy the Pwned Passwords range for a 5-hex-char SHA-1 prefix.

        The caller (browser) hashes the password and matches the returned
        suffixes locally — the password and full hash never reach this server,
        and nothing is stored.
        """
        return self.pwned.range(prefix5.upper())

    # -- management ---------------------------------------------------------
    def remove(self, identifier_id: str) -> bool:
        for f in self.findings.find(identifier_id=identifier_id):
            self.findings.delete(f.id)
        return self.identifiers.delete(identifier_id)
