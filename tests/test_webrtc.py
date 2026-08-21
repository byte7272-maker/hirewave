"""ICE-server config — STUN default, TURN ephemeral creds, static fallback."""

from __future__ import annotations

import base64
import hashlib
import hmac

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.webrtc import DEFAULT_STUN, build_ice_servers


def test_default_is_public_stun_only():
    servers = build_ice_servers(Settings())
    assert len(servers) == 1
    assert servers[0]["urls"] == list(DEFAULT_STUN)


def test_turn_ephemeral_credentials():
    s = Settings(turn_urls="turn:t.example.com:3478?transport=udp,turns:t.example.com:5349", turn_secret="topsecret", turn_ttl_seconds=3600)
    turn = build_ice_servers(s, user_id="usr_ada", now=1000)[1]
    assert turn["urls"] == ["turn:t.example.com:3478?transport=udp", "turns:t.example.com:5349"]
    # username = "<expiry>:<user>"; expiry = now + ttl
    assert turn["username"] == "4600:usr_ada"
    # credential = base64(HMAC-SHA1(secret, username))
    expected = base64.b64encode(hmac.new(b"topsecret", b"4600:usr_ada", hashlib.sha1).digest()).decode()
    assert turn["credential"] == expected
    # the static secret never appears in what the client receives
    assert "topsecret" not in (turn["username"] + turn["credential"])


def test_ephemeral_ttl_has_a_floor():
    turn = build_ice_servers(Settings(turn_urls="turn:t:3478", turn_secret="x", turn_ttl_seconds=5), user_id="u", now=0)[1]
    assert turn["username"].split(":")[0] == "60"  # ttl floored to 60s


def test_static_credentials_fallback():
    turn = build_ice_servers(Settings(turn_urls="turn:t:3478", turn_username="bob", turn_password="pw"))[1]
    assert turn["username"] == "bob" and turn["credential"] == "pw"


def test_secret_preferred_over_static():
    s = Settings(turn_urls="turn:t:3478", turn_secret="sek", turn_username="bob", turn_password="pw")
    turn = build_ice_servers(s, user_id="u", now=0)[1]
    assert turn["username"] != "bob"  # ephemeral wins


def test_turn_without_creds_is_bare_urls():
    turn = build_ice_servers(Settings(turn_urls="turn:t:3478"))[1]
    assert turn == {"urls": ["turn:t:3478"]}


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def test_api_ice_servers_endpoint():
    client = _client()
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    body = client.get("/api/v1/webrtc/ice-servers", headers=h).json()
    assert body["ice_servers"][0]["urls"] == list(DEFAULT_STUN)


def test_api_ice_servers_requires_auth():
    assert _client().get("/api/v1/webrtc/ice-servers").status_code == 401
