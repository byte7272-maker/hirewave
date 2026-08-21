"""ReminderEngine — dispatch review/renewal nudges across channels + track the
server-side consent anchor so the scheduler knows when to remind."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable, Optional
from zoneinfo import ZoneInfo

from jobsearch.engines.reminders.channels import (
    PushSender,
    SmsSender,
    build_push_sender,
    build_sms_sender,
)
from jobsearch.models import Notification, NotificationType, ReminderPrefs, User
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository


class ReminderEngine:
    def __init__(
        self,
        *,
        prefs: Optional[Repository[ReminderPrefs]] = None,
        users: Repository[User],
        settings=None,
        sms: Optional[SmsSender] = None,
        push: Optional[PushSender] = None,
        email=None,
        notifier: Optional[Callable] = None,
        digest_source: Optional[Callable[[str], dict]] = None,
    ) -> None:
        self.prefs = prefs or InMemoryRepository(id_attr="user_id")
        self.users = users
        self.settings = settings
        self.sms = sms or build_sms_sender(settings)
        self.push = push or build_push_sender(settings)
        self.email = email
        self._notify = notifier
        #: Called with a user_id → summary dict for the daily digest (wired by AppState).
        self.digest_source = digest_source

    # -- prefs --------------------------------------------------------------
    def get_prefs(self, user_id: str) -> ReminderPrefs:
        return self.prefs.get(user_id) or self.prefs.add(ReminderPrefs(user_id=user_id))

    _EDITABLE = (
        "inapp_enabled", "email_enabled", "sms_enabled", "push_enabled", "phone",
        "notify_on_apply", "timezone", "quiet_hours_enabled", "quiet_start", "quiet_end",
        "digest_enabled", "digest_hour",
    )

    def set_prefs(self, user_id: str, **fields) -> ReminderPrefs:
        p = self.get_prefs(user_id)
        for k in self._EDITABLE:
            if k in fields and fields[k] is not None:
                setattr(p, k, fields[k])
        p.updated_at = utcnow()
        return self.prefs.add(p)

    def add_push_subscription(self, user_id: str, subscription: dict) -> ReminderPrefs:
        p = self.get_prefs(user_id)
        endpoint = subscription.get("endpoint")
        p.push_subscriptions = [s for s in p.push_subscriptions if s.get("endpoint") != endpoint]
        p.push_subscriptions.append(subscription)
        p.push_enabled = True
        p.updated_at = utcnow()
        return self.prefs.add(p)

    def remove_push_subscription(self, user_id: str, endpoint: str) -> ReminderPrefs:
        p = self.get_prefs(user_id)
        p.push_subscriptions = [s for s in p.push_subscriptions if s.get("endpoint") != endpoint]
        if not p.push_subscriptions:
            p.push_enabled = False
        p.updated_at = utcnow()
        return self.prefs.add(p)

    def mark_renewed(self, user_id: str, *, now: Optional[datetime] = None) -> ReminderPrefs:
        p = self.get_prefs(user_id)
        p.renewed_at = now or utcnow()
        p.last_reminded_at = None  # a fresh review clears the nudge cooldown
        p.updated_at = utcnow()
        return self.prefs.add(p)

    # -- checkpoint ---------------------------------------------------------
    def _interval(self) -> timedelta:
        mins = getattr(self.settings, "reminder_review_interval_minutes", 5040) if self.settings else 5040
        return timedelta(minutes=mins)

    def _min_gap(self) -> timedelta:
        mins = getattr(self.settings, "reminder_min_gap_minutes", 720) if self.settings else 720
        return timedelta(minutes=mins)

    def review_due(self, prefs: ReminderPrefs, *, now: Optional[datetime] = None) -> bool:
        now = now or utcnow()
        return now - prefs.renewed_at >= self._interval()

    def _should_remind(self, prefs: ReminderPrefs, *, now: Optional[datetime] = None) -> bool:
        now = now or utcnow()
        if not self.review_due(prefs, now=now):
            return False
        if prefs.last_reminded_at and now - prefs.last_reminded_at < self._min_gap():
            return False
        return prefs.any_channel()

    # -- quiet hours --------------------------------------------------------
    def in_quiet_hours(self, prefs: ReminderPrefs, *, now: Optional[datetime] = None) -> bool:
        """True if it's currently within the user's local quiet window — when we
        suppress the noisy channels (SMS / push)."""
        if not prefs.quiet_hours_enabled:
            return False
        now = now or utcnow()
        try:
            hour = now.astimezone(ZoneInfo(prefs.timezone or "UTC")).hour
        except Exception:  # noqa: BLE001 - bad tz string → treat as no quiet hours
            return False
        start, end = prefs.quiet_start % 24, prefs.quiet_end % 24
        if start == end:
            return False
        if start < end:
            return start <= hour < end
        return hour >= start or hour < end  # wraps midnight

    # -- dispatch -----------------------------------------------------------
    def _dispatch(self, user: User, prefs: ReminderPrefs, *, title: str, body: str, url: str = "", now: Optional[datetime] = None) -> dict:
        """Send one message over the enabled channels. SMS + push are suppressed
        during quiet hours; in-app + email always go through."""
        quiet = self.in_quiet_hours(prefs, now=now)
        fired: dict[str, int] = {}
        if prefs.inapp_enabled and self._notify:
            try:
                self._notify(Notification(user_id=user.id, type=NotificationType.SYSTEM, message=body))
                fired["inapp"] = 1
            except Exception:  # noqa: BLE001
                pass
        if prefs.email_enabled and user.email and self.email is not None:
            try:
                if self.email.send(to=user.email, subject=title, body=body):
                    fired["email"] = 1
            except Exception:  # noqa: BLE001
                pass
        if not quiet and prefs.sms_enabled and prefs.phone:
            if self.sms.send(to=prefs.phone, body=f"{title}. {body}"):
                fired["sms"] = 1
        if not quiet and prefs.push_enabled and prefs.push_subscriptions:
            sent = sum(1 for sub in prefs.push_subscriptions if self.push.send(subscription=sub, title=title, body=body, url=url))
            if sent:
                fired["push"] = sent
        if quiet and (prefs.sms_enabled or prefs.push_enabled):
            fired["quiet_suppressed"] = 1
        return fired

    def _assistant_url(self) -> str:
        link = getattr(self.settings, "app_base_url", "") if self.settings else ""
        return f"{link}/dashboard/assistant" if link else ""

    def send_review_reminder(self, user: User, prefs: Optional[ReminderPrefs] = None, *, now: Optional[datetime] = None) -> dict:
        """Send the review nudge over every enabled channel. Returns which fired."""
        prefs = prefs or self.get_prefs(user.id)
        fired = self._dispatch(
            user, prefs, now=now,
            title="Renew your Hirewave automation",
            body="It's time to review and renew your job-search automation. Open Hirewave to keep it running.",
            url=self._assistant_url(),
        )
        prefs.last_reminded_at = now or utcnow()
        self.prefs.add(prefs)
        return fired

    def notify_applied(self, user_id: str, count: int, titles: Optional[list[str]] = None, *, now: Optional[datetime] = None) -> dict:
        """Notify the user that automation submitted applications on their behalf."""
        if count <= 0:
            return {}
        prefs = self.get_prefs(user_id)
        if not prefs.notify_on_apply:
            return {}
        user = self.users.get(user_id)
        if user is None:
            return {}
        sample = ", ".join((titles or [])[:3])
        body = f"Hirewave auto-applied to {count} job(s)" + (f": {sample}" + ("…" if count > 3 else "") if sample else ".")
        return self._dispatch(user, prefs, now=now, title="New applications submitted", body=body, url=self._assistant_url())

    def run_due_reminders(self, *, now: Optional[datetime] = None) -> list[dict]:
        """For every user past their review checkpoint (and not recently nudged),
        send a reminder. Called by the scheduler."""
        now = now or utcnow()
        out = []
        for prefs in self.prefs.all():
            if not self._should_remind(prefs, now=now):
                continue
            user = self.users.get(prefs.user_id)
            if user is None:
                continue
            fired = self.send_review_reminder(user, prefs, now=now)
            out.append({"user_id": prefs.user_id, "channels": fired})
        return out

    # -- daily digest -------------------------------------------------------
    def _local_now(self, prefs: ReminderPrefs, now: datetime):
        try:
            return now.astimezone(ZoneInfo(prefs.timezone or "UTC"))
        except Exception:  # noqa: BLE001
            return now

    def _digest_due(self, prefs: ReminderPrefs, now: datetime) -> bool:
        if not prefs.digest_enabled or not prefs.any_channel():
            return False
        local = self._local_now(prefs, now)
        if local.hour != (prefs.digest_hour % 24):
            return False
        if prefs.last_digest_at and self._local_now(prefs, prefs.last_digest_at).date() == local.date():
            return False  # already sent today
        return True

    def send_digest(self, user: User, summary: dict, prefs: Optional[ReminderPrefs] = None, *, now: Optional[datetime] = None) -> dict:
        """Send a one-line daily summary of automation activity."""
        prefs = prefs or self.get_prefs(user.id)
        parts = []
        if summary.get("submitted_24h"):
            parts.append(f"{summary['submitted_24h']} auto-applied")
        if summary.get("queued"):
            parts.append(f"{summary['queued']} awaiting your Apply click")
        if summary.get("new_matches"):
            parts.append(f"{summary['new_matches']} new matches")
        if summary.get("review_due"):
            parts.append("session review due")
        body = "Today on Hirewave: " + (", ".join(parts) if parts else "no automation activity") + "."
        fired = self._dispatch(user, prefs, now=now, title="Your Hirewave daily digest", body=body, url=self._assistant_url())
        prefs.last_digest_at = now or utcnow()
        self.prefs.add(prefs)
        return fired

    def run_due_digests(self, *, now: Optional[datetime] = None) -> list[dict]:
        """Send the daily digest to each user whose digest hour has arrived."""
        now = now or utcnow()
        out = []
        for prefs in self.prefs.all():
            if not self._digest_due(prefs, now):
                continue
            user = self.users.get(prefs.user_id)
            if user is None:
                continue
            summary = self.digest_source(prefs.user_id) if self.digest_source else {}
            fired = self.send_digest(user, summary, prefs, now=now)
            out.append({"user_id": prefs.user_id, "channels": fired, "summary": summary})
        return out
