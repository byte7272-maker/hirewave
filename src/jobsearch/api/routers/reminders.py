"""Reminder preferences + the server-side consent anchor.

The review checkpoint reaches the user out of band (SMS / web push / email) so it
nudges them even when the app is closed. The client calls ``/renew`` on sign-in
and renewal to keep the server anchor in sync; the scheduler sends the nudge.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    PushSubscribeRequest,
    ReminderPrefsOut,
    ReminderPrefsUpdate,
    ReminderTestOut,
)

router = APIRouter(prefix="/api/v1/reminders", tags=["reminders"])


def _out(prefs, state) -> ReminderPrefsOut:
    return ReminderPrefsOut(
        inapp_enabled=prefs.inapp_enabled,
        email_enabled=prefs.email_enabled,
        sms_enabled=prefs.sms_enabled,
        push_enabled=prefs.push_enabled,
        phone=prefs.phone,
        push_subscription_count=len(prefs.push_subscriptions),
        notify_on_apply=prefs.notify_on_apply,
        timezone=prefs.timezone,
        quiet_hours_enabled=prefs.quiet_hours_enabled,
        quiet_start=prefs.quiet_start,
        quiet_end=prefs.quiet_end,
        digest_enabled=prefs.digest_enabled,
        digest_hour=prefs.digest_hour,
        renewed_at=prefs.renewed_at.isoformat(),
        review_due=state.reminders.review_due(prefs),
        vapid_public_key=state.settings.vapid_public_key,
    )


@router.get("/prefs", response_model=ReminderPrefsOut)
def get_prefs(user: CurrentUser, state: StateDep) -> ReminderPrefsOut:
    return _out(state.reminders.get_prefs(user.id), state)


@router.put("/prefs", response_model=ReminderPrefsOut)
def set_prefs(body: ReminderPrefsUpdate, user: CurrentUser, state: StateDep) -> ReminderPrefsOut:
    prefs = state.reminders.set_prefs(user.id, **body.model_dump(exclude_none=True))
    return _out(prefs, state)


@router.post("/push/subscribe", response_model=ReminderPrefsOut)
def push_subscribe(body: PushSubscribeRequest, user: CurrentUser, state: StateDep) -> ReminderPrefsOut:
    if not body.subscription.get("endpoint"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "subscription must have an endpoint")
    return _out(state.reminders.add_push_subscription(user.id, body.subscription), state)


@router.post("/push/unsubscribe", response_model=ReminderPrefsOut)
def push_unsubscribe(body: PushSubscribeRequest, user: CurrentUser, state: StateDep) -> ReminderPrefsOut:
    endpoint = body.subscription.get("endpoint", "")
    return _out(state.reminders.remove_push_subscription(user.id, endpoint), state)


@router.post("/renew", response_model=ReminderPrefsOut)
def renew(user: CurrentUser, state: StateDep) -> ReminderPrefsOut:
    """Reset the server-side consent anchor — called on sign-in and renewal so
    the reminder scheduler counts from the last real human action."""
    return _out(state.reminders.mark_renewed(user.id), state)


@router.post("/test", response_model=ReminderTestOut)
def test_reminder(user: CurrentUser, state: StateDep) -> ReminderTestOut:
    """Send a reminder right now over the enabled channels, so the user can
    confirm their setup works. Does not touch the review clock."""
    account = state.users.get(user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    fired = state.reminders.send_review_reminder(account)
    return ReminderTestOut(channels=fired)
