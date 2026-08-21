"""Exposure-monitoring domain models (Phase 1: email breach monitoring).

Privacy by design: a monitored identifier's real value is stored **encrypted**
(``value`` is AES-256-GCM ciphertext) with a one-way ``value_hash`` for
dedup/lookup and a **masked** ``label`` for display. Findings record *what
category* of data leaked and *where* — never the leaked secret itself.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class IdentifierType(str, Enum):
    EMAIL = "email"  # phone/username in later phases


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class MonitoredIdentifier(DomainModel):
    id: str = Field(default_factory=lambda: new_id("mon_"))
    user_id: str
    type: IdentifierType = IdentifierType.EMAIL
    value: str = ""  # AES-256-GCM ciphertext of the real value — never plaintext
    value_hash: str = ""  # sha256 of the normalized value (dedup/lookup)
    label: str = ""  # masked, e.g. "s**@gmail.com" (safe to display)
    verified: bool = False  # ownership proven before any query
    verified_at: Optional[datetime] = None
    # Ownership-verification challenge (embedded):
    code_hash: str = ""  # sha256 of the one-time code
    code_expires_at: Optional[datetime] = None
    attempts: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class ExposureFinding(DomainModel):
    id: str = Field(default_factory=lambda: new_id("find_"))
    user_id: str
    identifier_id: str
    source: str = ""  # e.g. "mock:Acme Data Breach 2021" or "hibp:Adobe"
    title: str = ""
    exposed_data_types: list[str] = Field(default_factory=list)  # categories, not values
    breach_date: str = ""  # ISO date string (often date-only)
    severity: Severity = Severity.MEDIUM
    acknowledged: bool = False
    discovered_at: datetime = Field(default_factory=utcnow)
    details: dict[str, Any] = Field(default_factory=dict)  # non-secret metadata
