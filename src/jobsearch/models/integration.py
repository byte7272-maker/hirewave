"""OAuth integration tokens and the supported provider enumeration."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class Provider(str, Enum):
    """External services the platform can connect on the user's behalf."""

    LINKEDIN = "linkedin"
    GMAIL = "gmail"
    GOOGLE_DRIVE = "google_drive"
    INDEED = "indeed"
    GREENHOUSE = "greenhouse"
    WORKDAY = "workday"


class OAuthToken(DomainModel):
    """A user's stored credential for one provider.

    ``access_token`` / ``refresh_token`` hold **encrypted** ciphertext once the
    token has passed through the integration engine's token store — never store
    plaintext here. See :mod:`jobsearch.security.crypto`.
    """

    id: str = Field(default_factory=lambda: new_id("oauth_"))
    user_id: str
    provider: Provider
    access_token: str = ""  # encrypted at rest
    refresh_token: str = ""  # encrypted at rest
    scopes: list[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def is_expired(self, *, at: Optional[datetime] = None, skew_seconds: int = 60) -> bool:
        """True if the access token is expired (with a refresh-ahead skew)."""
        if self.expires_at is None:
            return False
        now = at or utcnow()
        return (self.expires_at - now).total_seconds() <= skew_seconds
