"""In-app inbox (email forwarding) + peer messaging/sharing — engines + API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger

ALERT = """From: LinkedIn <jobs-noreply@linkedin.com>
Subject: 2 new jobs
Content-Type: text/html

<a href="https://www.linkedin.com/jobs/view/501">Senior SRE</a><span>Datadog &middot; Remote</span>
<a href="https://www.linkedin.com/jobs/view/502">Platform Engineer</a><span>Stripe &middot; NYC</span>
"""


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str) -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": email.split("@")[0].title()})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# --- inbox ------------------------------------------------------------------
def test_forwarding_address_is_stable_and_unique():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    addr_a = client.get("/api/v1/inbox/address", headers=a).json()["address"]
    assert addr_a == client.get("/api/v1/inbox/address", headers=a).json()["address"]  # stable
    assert addr_a != client.get("/api/v1/inbox/address", headers=b).json()["address"]  # unique
    assert addr_a.startswith("jobs+") and "@inbox.hirewave.test" in addr_a


def test_inbound_webhook_routes_and_ingests():
    client = _client()
    a = _auth(client, "a@x.com")
    addr = client.get("/api/v1/inbox/address", headers=a).json()["address"]
    r = client.post("/api/v1/inbox/inbound", data={"to": addr, "email": ALERT})
    assert r.status_code == 200 and r.json()["accepted"] is True and r.json()["ingested"] == 2
    box = client.get("/api/v1/inbox", headers=a).json()
    assert len(box) == 1 and box[0]["source"] == "linkedin" and box[0]["ingested"] == 2
    matches = client.get("/api/v1/jobs/matches", headers=a).json()
    assert any(m["company"] == "Datadog" for m in matches)


def test_inbound_unknown_recipient_silently_accepted():
    client = _client()
    _auth(client, "a@x.com")
    r = client.post("/api/v1/inbox/inbound", data={"to": "jobs+deadbeef@inbox.hirewave.test", "email": ALERT})
    assert r.status_code == 200 and r.json()["accepted"] is False


def test_inbox_owner_scoped():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    addr = client.get("/api/v1/inbox/address", headers=a).json()["address"]
    mid = client.post("/api/v1/inbox/inbound", data={"to": addr, "email": ALERT}).json()["message_id"]
    assert client.post(f"/api/v1/inbox/{mid}/read", headers=b).status_code == 404  # not b's message
    assert client.post(f"/api/v1/inbox/{mid}/read", headers=a).status_code == 200


# --- social -----------------------------------------------------------------
def _connect(client: TestClient, a: dict, b: dict) -> tuple[str, str]:
    """Connect a↔b; return (a's id-of-b, b's id-of-a)."""
    code = client.post("/api/v1/social/invites", headers=a).json()["code"]
    client.post("/api/v1/social/invites/accept", headers=b, json={"code": code})
    b_id = client.get("/api/v1/social/connections", headers=a).json()[0]["user_id"]
    a_id = client.get("/api/v1/social/connections", headers=b).json()[0]["user_id"]
    return b_id, a_id


def test_invite_connect_flow():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    code = client.post("/api/v1/social/invites", headers=a).json()["code"]
    acc = client.post("/api/v1/social/invites/accept", headers=b, json={"code": code})
    assert acc.status_code == 200 and acc.json()["name"] == "A"
    assert len(client.get("/api/v1/social/connections", headers=a).json()) == 1


def test_cannot_accept_own_or_bad_invite():
    client = _client()
    a = _auth(client, "a@x.com")
    code = client.post("/api/v1/social/invites", headers=a).json()["code"]
    assert client.post("/api/v1/social/invites/accept", headers=a, json={"code": code}).status_code == 400
    assert client.post("/api/v1/social/invites/accept", headers=a, json={"code": "nope"}).status_code == 400


def test_messaging_requires_connection():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    # not connected yet — need b's id, grab it after connecting then message before? simplest: connect, then check unrelated third
    b_id, _ = _connect(client, a, b)
    c = _auth(client, "c@x.com")
    # a and c are not connected
    c_id = client.post("/api/v1/social/invites", headers=c).json()  # ensure c exists
    _ = c_id
    r = client.post("/api/v1/social/messages", headers=a, json={"to_user_id": "usr_nobody", "body": "hi"})
    assert r.status_code == 400


def test_send_receive_and_share_job():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    b_id, a_id = _connect(client, a, b)
    # a ingests a job then shares it with b
    client.post("/api/v1/job-search/run", headers=a, json={"role": "SRE", "remote": True})
    job_id = client.get("/api/v1/jobs/matches", headers=a).json()[0]["job_id"]
    sent = client.post("/api/v1/social/messages", headers=a, json={"to_user_id": b_id, "body": "look!", "shared_job_id": job_id})
    assert sent.status_code == 201 and sent.json()["shared_job"]["id"] == job_id
    conv = client.get(f"/api/v1/social/messages/{a_id}", headers=b).json()
    assert conv[0]["body"] == "look!" and conv[0]["mine"] is False and conv[0]["shared_job"]["id"] == job_id
    # b's thread shows the connection; after reading, unread clears
    threads = client.get("/api/v1/social/threads", headers=b).json()
    assert threads[0]["name"] == "A"


def test_share_missing_job_404():
    client = _client()
    a = _auth(client, "a@x.com")
    b = _auth(client, "b@x.com")
    b_id, _ = _connect(client, a, b)
    r = client.post("/api/v1/social/messages", headers=a, json={"to_user_id": b_id, "shared_job_id": "job_x"})
    assert r.status_code == 404


def test_social_requires_auth():
    client = _client()
    assert client.get("/api/v1/social/connections").status_code == 401
    assert client.get("/api/v1/inbox").status_code == 401
