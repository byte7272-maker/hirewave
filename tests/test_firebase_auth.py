"""Firebase sign-in exchange — verify an ID token, mint app session tokens,
create-or-link the user. Uses the offline mock verifier (email or JSON claims)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.firebase_auth import FirebaseAuthError, MockFirebaseVerifier
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


# ---- verifier -------------------------------------------------------------
def test_mock_verifier_accepts_email_or_json():
    v = MockFirebaseVerifier()
    assert v.verify("ada@x.com")["email"] == "ada@x.com"
    claims = v.verify(json.dumps({"email": "bob@x.com", "uid": "fb123", "name": "Bob"}))
    assert claims["uid"] == "fb123" and claims["name"] == "Bob"


def test_mock_verifier_rejects_junk():
    v = MockFirebaseVerifier()
    for bad in ["", "not-an-email", "{bad json"]:
        try:
            v.verify(bad)
            assert False, f"expected rejection for {bad!r}"
        except FirebaseAuthError:
            pass


# ---- exchange endpoint ----------------------------------------------------
def test_firebase_login_creates_user_and_returns_tokens():
    client = _client()
    r = client.post("/api/v1/auth/firebase", json={"id_token": "ada@example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    # the minted access token works against a protected route
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"}).json()
    assert me["email"] == "ada@example.com"


def test_firebase_login_is_idempotent_by_email():
    client = _client()
    client.post("/api/v1/auth/firebase", json={"id_token": "sam@example.com"})
    client.post("/api/v1/auth/firebase", json={"id_token": "sam@example.com"})
    tok = client.post("/api/v1/auth/firebase", json={"id_token": "sam@example.com"}).json()["access_token"]
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tok}"}).json()
    # still one account for that email
    assert me["email"] == "sam@example.com"


def test_firebase_login_links_existing_password_account():
    client = _client()
    client.post("/api/v1/auth/register", json={"email": "kim@example.com", "password": "supersecret", "full_name": "Kim"})
    r = client.post("/api/v1/auth/firebase", json={"id_token": json.dumps({"email": "kim@example.com", "uid": "fb_kim"})})
    assert r.status_code == 200  # same account, now linked to Firebase


def test_firebase_login_rejects_bad_token():
    client = _client()
    assert client.post("/api/v1/auth/firebase", json={"id_token": "garbage"}).status_code == 401
    assert client.post("/api/v1/auth/firebase", json={"id_token": ""}).status_code == 401
