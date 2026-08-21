"""Message boards, Gmail auto-pull, and invite-by-email."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.email_sender import MockEmailSender, build_email_sender
from jobsearch.engines.gmail_fetch import MockGmailAlertFetcher, build_gmail_fetcher
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.config import Settings


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str, name: str) -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": name})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# --- providers --------------------------------------------------------------
def test_provider_defaults_and_gmail_samples():
    assert isinstance(build_gmail_fetcher(Settings(gmail_fetch="mock")), MockGmailAlertFetcher)
    assert isinstance(build_email_sender(Settings(email_sender="mock")), MockEmailSender)
    raws = MockGmailAlertFetcher().fetch()
    assert len(raws) == 2 and "linkedin" in raws[0].lower()


# --- gmail sync -------------------------------------------------------------
def test_api_gmail_sync_ingests_into_inbox_and_matches():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    r = client.post("/api/v1/inbox/sync-gmail", headers=a).json()
    assert r["fetched"] == 2 and r["ingested"] >= 3
    box = client.get("/api/v1/inbox", headers=a).json()
    assert {m["source"] for m in box} == {"linkedin", "indeed"}
    matches = client.get("/api/v1/jobs/matches", headers=a).json()
    assert any(m["company"] == "Snowflake" for m in matches)


# --- email invite -----------------------------------------------------------
def test_api_email_invite_returns_code_and_connects():
    client = _client()
    a = _auth(client, "a@x.com", "Alice")
    b = _auth(client, "b@x.com", "Bob")
    r = client.post("/api/v1/social/invites/email", headers=a, json={"email": "bob@x.com"}).json()
    assert r["code"] and r["emailed"] is False  # mock sender doesn't actually send
    assert "invite=" in r["link"]
    # Bob redeems the code
    acc = client.post("/api/v1/social/invites/accept", headers=b, json={"code": r["code"]})
    assert acc.status_code == 200 and acc.json()["name"] == "Alice"


def test_api_email_invite_rejects_bad_email():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    assert client.post("/api/v1/social/invites/email", headers=a, json={"email": "not-an-email"}).status_code == 400


# --- boards -----------------------------------------------------------------
def test_board_create_join_post_flow():
    client = _client()
    a = _auth(client, "a@x.com", "Alice")
    b = _auth(client, "b@x.com", "Bob")
    brd = client.post("/api/v1/boards", headers=a, json={"name": "Remote Backend", "is_public": True}).json()
    assert brd["is_owner"] and brd["joined"] and brd["member_count"] == 1

    # Bob discovers + joins the public board
    disc = client.get("/api/v1/boards/discover", headers=b).json()
    assert any(x["id"] == brd["id"] and not x["joined"] for x in disc)
    client.post("/api/v1/boards/join", headers=b, json={"board_id": brd["id"]})

    # a shares a job to the board; b replies
    client.post("/api/v1/job-search/run", headers=a, json={"role": "SRE", "remote": True})
    job_id = client.get("/api/v1/jobs/matches", headers=a).json()[0]["job_id"]
    client.post(f"/api/v1/boards/{brd['id']}/posts", headers=a, json={"body": "nice role", "shared_job_id": job_id})
    client.post(f"/api/v1/boards/{brd['id']}/posts", headers=b, json={"body": "thanks!"})
    posts = client.get(f"/api/v1/boards/{brd['id']}/posts", headers=b).json()
    assert [p["author"] for p in posts] == ["Alice", "Bob"]
    assert posts[0]["shared_job"]["id"] == job_id
    members = client.get(f"/api/v1/boards/{brd['id']}/members", headers=b).json()
    assert {m["name"] for m in members} == {"Alice", "Bob"}


def test_private_board_needs_code_and_blocks_nonmembers():
    client = _client()
    a = _auth(client, "a@x.com", "A")
    b = _auth(client, "b@x.com", "B")
    brd = client.post("/api/v1/boards", headers=a, json={"name": "Secret", "is_public": False}).json()
    # not in discover; posting without joining is blocked
    assert all(x["id"] != brd["id"] for x in client.get("/api/v1/boards/discover", headers=b).json())
    assert client.post(f"/api/v1/boards/{brd['id']}/posts", headers=b, json={"body": "hi"}).status_code == 400
    # join without the code fails, with the code works
    assert client.post("/api/v1/boards/join", headers=b, json={"board_id": brd["id"]}).status_code == 400
    assert client.post("/api/v1/boards/join", headers=b, json={"code": brd["join_code"]}).status_code == 200


def test_boards_require_auth():
    client = _client()
    assert client.get("/api/v1/boards").status_code == 401
