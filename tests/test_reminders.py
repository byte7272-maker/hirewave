"""Review-checkpoint reminders — channels (mock), due detection, dispatch,
rate-limiting, the scheduler hook, and the API surface."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch import scheduler
from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import AutoApplyCriteria, JobPosting, User
from jobsearch.models.common import utcnow


def _state() -> AppState:
    return AppState(exchanger=MockTokenExchanger())


def _user(state, uid="u1", phone="+15551230000"):
    return state.users.add(User(id=uid, email=f"{uid}@x.com", full_name="Ada", phone=phone))


def _job(state, jid, title, *, platform="indeed", verified=True, score=80.0):
    return state.jobs.add(JobPosting(
        id=jid, title=title, company="Acme", source_platform=platform,
        url=f"https://jobs/{jid}", is_verified=verified, match_score=score,
    ))


def _make_due(state, uid, days=4):
    p = state.reminders.get_prefs(uid)
    p.renewed_at = utcnow() - timedelta(days=days)
    state.reminders.prefs.add(p)
    return p


# ---- due detection --------------------------------------------------------
def test_not_due_right_after_renewal():
    state = _state()
    _user(state)
    assert state.reminders.review_due(state.reminders.get_prefs("u1")) is False


def test_due_after_half_the_window():
    state = _state()
    _user(state)
    assert state.reminders.review_due(_make_due(state, "u1")) is True


# ---- dispatch across channels --------------------------------------------
def test_dispatch_hits_enabled_channels_only():
    state = _state()
    u = _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, email_enabled=True, inapp_enabled=True, phone="+15551230000", quiet_hours_enabled=False)
    fired = state.reminders.send_review_reminder(u)
    assert fired.get("sms") == 1 and fired.get("email") == 1 and fired.get("inapp") == 1
    assert state.reminders.sms.sent[0]["to"] == "+15551230000"  # mock recorded it
    # an in-app notification was created
    assert any("renew" in n.message.lower() for n in state.notifications.find(user_id="u1"))


def test_sms_needs_a_phone():
    state = _state()
    u = _user(state, phone="")
    state.reminders.set_prefs("u1", sms_enabled=True, email_enabled=False, inapp_enabled=False, phone="")
    fired = state.reminders.send_review_reminder(u)
    assert "sms" not in fired  # enabled but no number → not sent


def test_push_subscription_lifecycle():
    state = _state()
    u = _user(state)
    state.reminders.set_prefs("u1", quiet_hours_enabled=False)
    state.reminders.add_push_subscription("u1", {"endpoint": "https://push/abc", "keys": {"p256dh": "k", "auth": "a"}})
    p = state.reminders.get_prefs("u1")
    assert p.push_enabled and len(p.push_subscriptions) == 1
    fired = state.reminders.send_review_reminder(u)
    assert fired.get("push") == 1
    assert state.reminders.push.sent[0]["title"].startswith("Renew")
    state.reminders.remove_push_subscription("u1", "https://push/abc")
    assert state.reminders.get_prefs("u1").push_enabled is False


# ---- rate-limiting + run_due ---------------------------------------------
def test_run_due_reminds_then_respects_cooldown():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000", quiet_hours_enabled=False)
    _make_due(state, "u1")
    first = state.reminders.run_due_reminders()
    assert len(first) == 1 and first[0]["channels"].get("sms") == 1
    # immediately again → cooldown suppresses it
    assert state.reminders.run_due_reminders() == []


def test_renew_clears_due_and_cooldown():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000")
    _make_due(state, "u1")
    state.reminders.run_due_reminders()
    state.reminders.mark_renewed("u1")
    p = state.reminders.get_prefs("u1")
    assert state.reminders.review_due(p) is False and p.last_reminded_at is None


def test_scheduler_reports_reminders():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000")
    _make_due(state, "u1")
    summary = scheduler.run_once(state)
    assert summary["reminders_sent"] == 1


# ---- API ------------------------------------------------------------------
def _client_and_token():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()["access_token"]
    return client, {"Authorization": f"Bearer {tok}"}


def test_api_requires_auth():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.get("/api/v1/reminders/prefs").status_code == 401


def test_api_prefs_subscribe_and_test():
    client, h = _client_and_token()
    prefs = client.put("/api/v1/reminders/prefs", json={"sms_enabled": True, "phone": "+15559990000", "quiet_hours_enabled": False}, headers=h).json()
    assert prefs["sms_enabled"] is True and prefs["phone"] == "+15559990000"
    assert prefs["review_due"] is False  # brand-new anchor
    sub = {"endpoint": "https://push/xyz", "keys": {"p256dh": "k", "auth": "a"}}
    after = client.post("/api/v1/reminders/push/subscribe", json={"subscription": sub}, headers=h).json()
    assert after["push_enabled"] is True and after["push_subscription_count"] == 1
    # test send fires the enabled channels (mock)
    fired = client.post("/api/v1/reminders/test", json={}, headers=h).json()["channels"]
    assert fired.get("sms") == 1 and fired.get("push") == 1


def test_api_renew_resets_anchor():
    client, h = _client_and_token()
    r = client.post("/api/v1/reminders/renew", json={}, headers=h)
    assert r.status_code == 200 and r.json()["review_due"] is False


# ---- quiet hours ----------------------------------------------------------
from datetime import datetime, timezone  # noqa: E402


def test_quiet_hours_suppress_noisy_channels():
    state = _state()
    u = _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, email_enabled=True, phone="+15551230000",
                              timezone="America/New_York", quiet_hours_enabled=True, quiet_start=22, quiet_end=8)
    p = state.reminders.get_prefs("u1")
    night = datetime(2026, 8, 18, 7, 0, tzinfo=timezone.utc)   # 3am ET → quiet
    day = datetime(2026, 8, 18, 19, 0, tzinfo=timezone.utc)    # 3pm ET → not
    assert state.reminders.in_quiet_hours(p, now=night) is True
    assert state.reminders.in_quiet_hours(p, now=day) is False
    # at night: SMS suppressed, email still sent
    fired = state.reminders.send_review_reminder(u, now=night)
    assert "sms" not in fired and fired.get("email") == 1 and fired.get("quiet_suppressed") == 1
    # by day: SMS goes through
    state.reminders.mark_renewed("u1")
    fired2 = state.reminders.send_review_reminder(u, now=day)
    assert fired2.get("sms") == 1


def test_quiet_hours_wrap_midnight_and_disabled():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", timezone="UTC", quiet_hours_enabled=True, quiet_start=22, quiet_end=8)
    p = state.reminders.get_prefs("u1")
    assert state.reminders.in_quiet_hours(p, now=datetime(2026, 8, 18, 23, 0, tzinfo=timezone.utc)) is True  # 11pm
    assert state.reminders.in_quiet_hours(p, now=datetime(2026, 8, 18, 3, 0, tzinfo=timezone.utc)) is True   # 3am
    assert state.reminders.in_quiet_hours(p, now=datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)) is False  # noon
    state.reminders.set_prefs("u1", quiet_hours_enabled=False)
    assert state.reminders.in_quiet_hours(state.reminders.get_prefs("u1"), now=datetime(2026, 8, 18, 3, 0, tzinfo=timezone.utc)) is False


# ---- apply-event notifications -------------------------------------------
def test_auto_apply_notifies_over_channels():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000", quiet_hours_enabled=False)
    _job(state, "in1", "Python Engineer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply.run_grant(grant)  # wired: event_notifier -> reminders.notify_applied
    assert state.reminders.sms.sent and "auto-applied to 1 job" in state.reminders.sms.sent[-1]["body"].lower()


def test_notify_on_apply_can_be_disabled():
    state = _state()
    _user(state)
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000", quiet_hours_enabled=False, notify_on_apply=False)
    _job(state, "in1", "Python Engineer", platform="indeed")
    grant = state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]))
    state.auto_apply.run_grant(grant)
    assert state.reminders.sms.sent == []  # opt-out honored


# ---- daily digest ---------------------------------------------------------
def test_digest_fires_at_hour_once_per_day():
    state = _state()
    _user(state)
    # send at whatever the current UTC hour is, tz=UTC, quiet off
    hour = utcnow().hour
    state.reminders.set_prefs("u1", sms_enabled=True, phone="+15551230000", timezone="UTC",
                              quiet_hours_enabled=False, digest_enabled=True, digest_hour=hour)
    first = state.reminders.run_due_digests()
    assert len(first) == 1 and first[0]["channels"].get("sms") == 1
    assert state.reminders.run_due_digests() == []  # not twice the same day


def test_digest_skipped_outside_its_hour():
    state = _state()
    _user(state)
    other = (utcnow().hour + 6) % 24
    state.reminders.set_prefs("u1", email_enabled=True, timezone="UTC", digest_enabled=True, digest_hour=other)
    assert state.reminders.run_due_digests() == []


# ---- API: new prefs -------------------------------------------------------
def test_api_prefs_expose_quiet_and_digest():
    client, h = _client_and_token()
    body = {"timezone": "America/New_York", "quiet_start": 23, "quiet_end": 7, "digest_enabled": True, "digest_hour": 9}
    p = client.put("/api/v1/reminders/prefs", json=body, headers=h).json()
    assert p["timezone"] == "America/New_York" and p["quiet_start"] == 23
    assert p["digest_enabled"] is True and p["digest_hour"] == 9
    # out-of-range hour rejected
    assert client.put("/api/v1/reminders/prefs", json={"quiet_start": 99}, headers=h).status_code == 422
