"""Real-time activity feed: merges notifications + pending-approval checkpoints, flags
what needs the user's action, and reports live-vs-simulated mode truthfully."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import Application, ApplicationStatus, Notification, NotificationType


def _app(**settings_kw):
    s = Settings(**settings_kw)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="u@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_activity_empty_for_a_new_user():
    _, c = _app()
    h = _auth(c)
    b = c.get("/api/v1/activity", headers=h).json()
    assert b["items"] == []
    assert b["pending_action_count"] == 0 and b["unread_count"] == 0
    # mode block always present, and all-off under the offline defaults
    assert b["mode"] == {
        "automation_live": False, "submit_live": False,
        "email_scan_live": False, "sourcing_live": False, "worker_active": False,
    }


def test_notification_shows_as_a_passive_feed_item():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("u@x.com").id
    state.notifications.add(Notification(user_id=uid, type=NotificationType.MATCH_FOUND,
                                         message="Added 3 new matches from your inbox"))
    b = c.get("/api/v1/activity", headers=h).json()
    it = next(i for i in b["items"] if i["kind"] == "notification")
    assert it["category"] == "matches"
    assert it["requires_action"] is False
    assert b["unread_count"] == 1 and b["pending_action_count"] == 0


def test_reauth_notification_requires_action():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("u@x.com").id
    state.notifications.add(Notification(user_id=uid, type=NotificationType.REAUTH_REQUIRED,
                                         message="Reconnect your Gmail to keep matches fresh"))
    b = c.get("/api/v1/activity", headers=h).json()
    it = next(i for i in b["items"] if i["type"].lower().find("reauth") >= 0 or i["category"] == "security")
    assert it["requires_action"] is True and it["category"] == "security"
    assert b["pending_action_count"] >= 1


def test_pending_approval_is_a_checkpoint_with_approve_reject():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("u@x.com").id
    app = state.applications.add(Application(
        user_id=uid, job_posting_id="job_1", status=ApplicationStatus.PENDING_APPROVAL,
        platform_response={"auto_apply": True, "pending": True, "provider": "linkedin"},
    ))
    b = c.get("/api/v1/activity", headers=h).json()
    chk = next(i for i in b["items"] if i["kind"] == "checkpoint")
    assert chk["requires_action"] is True
    act = chk["action"]
    assert act["application_id"] == app.id
    assert act["approve"] == f"/api/v1/auto-apply/approvals/{app.id}/approve"
    assert act["reject"] == f"/api/v1/auto-apply/approvals/{app.id}/reject"
    # nothing gets sent for real unless the live-submit gate is on (it's off here)
    assert act["will_submit_for_real"] is False
    assert b["pending_action_count"] == 1


def test_since_filters_notifications_but_always_keeps_checkpoints():
    state, c = _app()
    h = _auth(c)
    uid = state.user_by_email("u@x.com").id
    # an OLD notification (2020) + a pending checkpoint
    state.notifications.add(Notification(
        user_id=uid, type=NotificationType.SYSTEM, message="old event",
        created_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
    ))
    state.applications.add(Application(
        user_id=uid, job_posting_id="job_1", status=ApplicationStatus.PENDING_APPROVAL,
        platform_response={"provider": "linkedin"},
    ))
    b = c.get("/api/v1/activity?since=2021-01-01T00:00:00%2B00:00", headers=h).json()
    kinds = [i["kind"] for i in b["items"]]
    assert "notification" not in kinds          # old notification filtered out by `since`
    assert "checkpoint" in kinds                # checkpoint always included


def test_mode_reports_live_automation_truthfully():
    _, c = _app(
        gmail_fetch="http", automation_mode="live",
        job_source_provider="http", auto_apply_live_submit=True,
    )
    h = _auth(c)
    mode = c.get("/api/v1/activity", headers=h).json()["mode"]
    assert mode["automation_live"] is True
    assert mode["submit_live"] is True
    assert mode["email_scan_live"] is True
    assert mode["sourcing_live"] is True
