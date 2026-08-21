"""Peer practice interviews — session lifecycle + WebRTC signalling mailbox."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str, name: str) -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": name})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _connect(client, a, b) -> str:
    """Connect a↔b, return b's user id (from a's perspective)."""
    code = client.post("/api/v1/social/invites", headers=a).json()["code"]
    client.post("/api/v1/social/invites/accept", headers=b, json={"code": code})
    return client.get("/api/v1/social/connections", headers=a).json()[0]["user_id"]


def test_invite_requires_connection():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    _auth(client, "b@x.com", "B")
    assert client.post("/api/v1/practice", headers=a, json={"guest_id": "usr_stranger"}).status_code == 400


def test_invite_accept_lifecycle():
    client = _client()
    a = _auth(client, "a@x.com", "Alice")
    b = _auth(client, "b@x.com", "Bob")
    bob_id = _connect(client, a, b)
    sess = client.post("/api/v1/practice", headers=a, json={"guest_id": bob_id})
    assert sess.status_code == 201
    s = sess.json()
    assert s["status"] == "waiting" and s["i_am_host"] and s["other_name"] == "Bob"
    # bob sees the invite from his side
    bob_view = client.get("/api/v1/practice", headers=b).json()[0]
    assert bob_view["i_am_host"] is False and bob_view["other_name"] == "Alice"
    # bob accepts → active
    assert client.post(f"/api/v1/practice/{s['id']}/accept", headers=b).json()["status"] == "active"
    # a non-participant can't see it
    c = _auth(client, "c@x.com", "C")
    assert client.get(f"/api/v1/practice/{s['id']}", headers=c).status_code == 404


def test_signalling_mailbox_routes_and_consumes():
    client = _client()
    a = _auth(client, "a@x.com", "Alice")
    b = _auth(client, "b@x.com", "Bob")
    bob_id = _connect(client, a, b)
    sid = client.post("/api/v1/practice", headers=a, json={"guest_id": bob_id}).json()["id"]
    client.post(f"/api/v1/practice/{sid}/accept", headers=b)

    client.post(f"/api/v1/practice/{sid}/signal", headers=a, json={"kind": "offer", "payload": "SDP"})
    client.post(f"/api/v1/practice/{sid}/signal", headers=a, json={"kind": "ice", "payload": "cand"})
    got = client.get(f"/api/v1/practice/{sid}/signals", headers=b).json()
    assert [g["kind"] for g in got] == ["offer", "ice"]  # ordered
    # consumed on read
    assert client.get(f"/api/v1/practice/{sid}/signals", headers=b).json() == []
    # sender never receives their own messages
    assert client.get(f"/api/v1/practice/{sid}/signals", headers=a).json() == []


def test_shared_questions_are_persona_free():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    b = _auth(client, "b@x.com", "B")
    bob_id = _connect(client, a, b)
    sid = client.post("/api/v1/practice", headers=a, json={"guest_id": bob_id}).json()["id"]
    qs = client.get(f"/api/v1/practice/{sid}/questions", headers=b).json()["questions"]
    assert len(qs) >= 3 and all(isinstance(q, str) for q in qs)


def test_end_removes_from_active_list():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    b = _auth(client, "b@x.com", "B")
    bob_id = _connect(client, a, b)
    sid = client.post("/api/v1/practice", headers=a, json={"guest_id": bob_id}).json()["id"]
    assert client.post(f"/api/v1/practice/{sid}/end", headers=a).status_code == 204
    assert client.get("/api/v1/practice", headers=a).json() == []
    # the other side gets a "bye" signal
    assert any(g["kind"] == "bye" for g in client.get(f"/api/v1/practice/{sid}/signals", headers=b).json())


def test_practice_requires_auth():
    client = _client()
    assert client.get("/api/v1/practice").status_code == 401
