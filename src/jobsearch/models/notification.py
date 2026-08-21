"""User notifications."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class NotificationType(str, Enum):
    MATCH_FOUND = "match_found"
    DOCUMENT_READY = "document_ready"
    APPLICATION_SUBMITTED = "application_submitted"
    APPLICATION_FAILED = "application_failed"
    REAUTH_REQUIRED = "reauth_required"
    VERIFICATION_WARNING = "verification_warning"
    SECURITY_EXPOSURE = "security_exposure"
    SYSTEM = "system"


class Notification(DomainModel):
    id: str = Field(default_factory=lambda: new_id("ntf_"))
    user_id: str
    type: NotificationType = NotificationType.SYSTEM
    message: str = ""
    is_read: bool = False
    created_at: datetime = Field(default_factory=utcnow)
