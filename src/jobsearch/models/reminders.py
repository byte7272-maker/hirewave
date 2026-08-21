"""Reminder preferences + the server-side consent anchor.

Reminders reach the user *out of band* (SMS / web push / email) — so the review
checkpoint nudges them even when the app isn't open. The consent anchor
(``renewed_at``) lives here on the server too (the client also tracks it locally),
so the scheduler can tell when a user's session is due for review and remind them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, utcnow


class ReminderPrefs(DomainModel):
    # Keyed by user_id (one record per user).
    user_id: str

    # Channels (all opt-in except in-app; a channel also needs its contact info).
    inapp_enabled: bool = True
    email_enabled: bool = True
    sms_enabled: bool = False
    push_enabled: bool = False

    phone: str = ""  # E.164, e.g. +15551234567 — required for SMS
    #: Raw browser PushSubscription JSON blobs ({endpoint, keys:{p256dh,auth}}).
    push_subscriptions: list[dict] = Field(default_factory=list)

    # Also nudge on automation events (e.g. "auto-applied to 3 jobs").
    notify_on_apply: bool = True

    # Quiet hours: don't send the noisy channels (SMS / push) during these local
    # hours. In-app + email still go through (they're not disruptive).
    timezone: str = "UTC"  # IANA name, e.g. "America/New_York"
    quiet_hours_enabled: bool = True
    quiet_start: int = 22  # local hour [0-23] quiet begins
    quiet_end: int = 8     # local hour [0-23] quiet ends (wraps past midnight)

    # Daily digest: one summary at a chosen local hour.
    digest_enabled: bool = False
    digest_hour: int = 8  # local hour [0-23] to send it
    last_digest_at: Optional[datetime] = None

    #: Last explicit sign-in / renewal — the anchor the review checkpoint counts from.
    renewed_at: datetime = Field(default_factory=utcnow)
    #: Last time a review reminder was sent (to rate-limit re-sends).
    last_reminded_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=utcnow)

    def any_channel(self) -> bool:
        return (
            (self.sms_enabled and bool(self.phone))
            or (self.push_enabled and bool(self.push_subscriptions))
            or self.email_enabled
            or self.inapp_enabled
        )
