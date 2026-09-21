"""Stealth branding + gated account creation (invite system)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _client(**settings) -> TestClient:
    return TestClient(create_app(state=AppState(settings=Settings(**settings), exchanger=MockTokenExchanger())))


# --- branding ---------------------------------------------------------------
def test_branding_hides_real_name_in_stealth():
    c = _client()  # default = stealth
    b = c.get("/api/v1/branding").json()
    assert b["name"] == "Project Harbor" and b["brand_mode"] == "stealth"
    assert b["name"] != "Hirewave"
    # the OpenAPI/docs title must not leak the real brand either
    assert "Hirewave" not in c.get("/openapi.json").json()["info"]["title"]


def test_branding_reveals_real_name_in_public():
    c = _client(brand_mode="public", brand_name="Hirewave")
    assert c.get("/api/v1/branding").json()["name"] == "Hirewave"


def test_emails_and_reminders_use_codename_in_stealth():
    # Outbound copy (invite emails, reminders/digest) must not leak the real brand.
    from jobsearch.api.state import AppState
    from jobsearch.models import User

    st = AppState(settings=Settings(), exchanger=MockTokenExchanger())  # stealth default
    u = st.users.add(User(email="inv@x.com", full_name="Sam"))
    st.social.invite_by_email(u.id, "friend@x.com")
    subj = st.social.email_sender.sent[-1]["subject"]
    assert "Hirewave" not in subj and "Project Harbor" in subj

    st.reminders.send_digest(u, {"submitted_24h": 2})
    msgs = [n.message for n in st.notifications.find(user_id=u.id)]
    assert msgs and not any("Hirewave" in m for m in msgs)
    assert any("Project Harbor" in m for m in msgs)


# --- signup modes -----------------------------------------------------------
def test_open_mode_allows_registration():
    c = _client()  # default open
    assert c.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret12"}).status_code == 201


def test_closed_mode_blocks_registration():
    c = _client(signup_mode="closed")
    assert c.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret12"}).status_code == 403


def test_invite_mode_requires_a_valid_code():
    c = _client(signup_mode="invite", signup_access_code="LETMEIN")
    reg = lambda email, code="": c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "invite_code": code})
    assert reg("no@b.com").status_code == 403  # no code
    assert reg("bad@b.com", "wrong").status_code == 403  # wrong code
    assert reg("ok@b.com", "LETMEIN").status_code == 201  # shared access code


# --- admin-managed invites --------------------------------------------------
def test_admin_mints_single_use_invite():
    c = _client(signup_mode="invite", admin_token="ADMINSECRET")
    admin = {"X-Admin-Token": "ADMINSECRET"}

    # admin endpoints are gated
    assert c.post("/api/v1/admin/invites", json={"label": "jane"}).status_code == 403
    minted = c.post("/api/v1/admin/invites", headers=admin, json={"label": "jane", "max_uses": 1}).json()
    code = minted[0]["code"]
    assert code and minted[0]["label"] == "jane"

    reg = lambda email, code: c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "invite_code": code})
    assert reg("jane@b.com", code).status_code == 201  # first use works
    assert reg("jane2@b.com", code).status_code == 403  # single-use: exhausted

    # listing + revoke
    invites = c.get("/api/v1/admin/invites", headers=admin).json()
    assert any(i["code"] == code and i["uses"] == 1 for i in invites)
    inv_id = next(i["id"] for i in invites if i["code"] == code)
    assert c.delete(f"/api/v1/admin/invites/{inv_id}", headers=admin).status_code == 204


def test_admin_disabled_when_no_token_configured():
    # With no admin token set, the admin endpoints are off entirely (safe default).
    c = _client(signup_mode="invite")
    assert c.post("/api/v1/admin/invites", headers={"X-Admin-Token": "anything"}, json={}).status_code == 403


def test_multi_use_invite_allows_several_signups():
    c = _client(signup_mode="invite", admin_token="T")
    code = c.post("/api/v1/admin/invites", headers={"X-Admin-Token": "T"}, json={"max_uses": 2}).json()[0]["code"]
    reg = lambda email: c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "invite_code": code})
    assert reg("one@b.com").status_code == 201
    assert reg("two@b.com").status_code == 201
    assert reg("three@b.com").status_code == 403  # cap reached
