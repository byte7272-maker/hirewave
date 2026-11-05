"""iCloud Mail over IMAP: per-user app-password connect (encrypted at rest),
discovery, the OAuth-vs-IMAP guard, connected-apps surfacing, scan ingest, and the
scheduler reap. The IMAP network boundary is monkeypatched so everything runs offline.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing.imap_source import (
    IMAP_PROVIDERS,
    MockJobMailSource,
    build_imap_source,
    imap_provider_config,
    is_imap_provider,
    verify_imap_login,
)
from jobsearch.models import Provider


def _app(**settings_kw):
    # Default: skip the live IMAP login check so connect works offline. Individual
    # tests flip imap_verify_on_connect back on and monkeypatch the verifier.
    settings_kw.setdefault("imap_verify_on_connect", False)
    s = Settings(**settings_kw)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="u@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "U"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _connect_icloud(c, h, email="me@icloud.com", pw="abcd-efgh-ijkl-mnop"):
    return c.post(
        "/api/v1/integrations/connect-imap",
        headers=h,
        json={"provider": "icloud", "email": email, "app_password": pw},
    )


# --- registry / helpers (pure) ---------------------------------------------
def test_icloud_is_a_registered_imap_provider():
    assert is_imap_provider("icloud") and is_imap_provider("iCloud")
    assert not is_imap_provider("gmail")
    cfg = imap_provider_config("icloud")
    assert cfg["host"] == "imap.mail.me.com" and cfg["port"] == 993
    assert "appleid.apple.com" in cfg["app_password_url"]


def test_verify_imap_login_rejects_missing_fields_without_network():
    ok, err = verify_imap_login(host="imap.mail.me.com", port=993, username="", password="")
    assert ok is False and err


def test_build_imap_source_uses_registry_host():
    src = build_imap_source("icloud", username="me@icloud.com", password="pw")
    assert src._host == "imap.mail.me.com" and src._username == "me@icloud.com"


# --- connect (API) ----------------------------------------------------------
def test_connect_icloud_stores_encrypted_and_lists():
    state, c = _app()
    h = _auth(c)
    r = _connect_icloud(c, h)
    assert r.status_code == 200, r.text
    assert r.json()["account_email"] == "me@icloud.com"

    # Surfaced in the connections list…
    conns = c.get("/api/v1/integrations", headers=h).json()
    icloud = next(x for x in conns if x["provider"] == "icloud")
    assert icloud["account_email"] == "me@icloud.com" and icloud["expired"] is False

    # …and the app password is encrypted at rest (never the plaintext).
    uid = state.user_by_email("u@x.com").id
    rec = state.integration.tokens.get_record(uid, Provider.ICLOUD)
    assert rec.access_token and rec.access_token != "abcd-efgh-ijkl-mnop"
    # …but reveals back to the original secret for fetching.
    assert state.integration.imap_inboxes(uid, Provider.ICLOUD) == [("me@icloud.com", "abcd-efgh-ijkl-mnop")]


def test_connect_icloud_unknown_provider_is_400():
    _, c = _app()
    h = _auth(c)
    r = c.post("/api/v1/integrations/connect-imap", headers=h,
               json={"provider": "hotmail", "email": "a@b.com", "app_password": "x"})
    assert r.status_code == 400 and "unknown IMAP provider" in r.text


def test_connect_icloud_requires_email_and_password():
    _, c = _app()
    h = _auth(c)
    r = c.post("/api/v1/integrations/connect-imap", headers=h,
               json={"provider": "icloud", "email": "", "app_password": ""})
    assert r.status_code == 400


def test_connect_icloud_rejects_bad_credentials_when_verifying(monkeypatch):
    # Verification ON; the live login is stubbed to fail → connect must 400 and store nothing.
    _, c = _app(imap_verify_on_connect=True)
    h = _auth(c)
    import jobsearch.api.routers.integrations as integ
    monkeypatch.setattr(integ, "verify_imap_login",
                        lambda **kw: (False, "the email or app-specific password was not accepted"))
    r = _connect_icloud(c, h)
    assert r.status_code == 400 and "could not connect iCloud Mail" in r.text
    assert c.get("/api/v1/integrations", headers=h).json() == []


def test_oauth_connect_endpoint_rejects_icloud():
    # /connect/{provider} is OAuth-only; iCloud must be pointed at connect-imap, not 500.
    _, c = _app()
    h = _auth(c)
    r = c.post("/api/v1/integrations/connect/icloud", headers=h)
    assert r.status_code == 400 and "connect-imap" in r.text


# --- discovery + connected-apps --------------------------------------------
def test_imap_providers_discovery_lists_icloud():
    _, c = _app()
    h = _auth(c)
    provs = c.get("/api/v1/integrations/imap-providers", headers=h).json()
    icloud = next(p for p in provs if p["provider"] == "icloud")
    assert icloud["label"] == "iCloud Mail" and icloud["host"] == "imap.mail.me.com"
    assert "appleid.apple.com" in icloud["app_password_url"]


def test_connected_apps_surfaces_icloud_as_imap():
    _, c = _app()
    h = _auth(c)
    before = {a["provider"]: a for a in c.get("/api/v1/integrations/connected-apps", headers=h).json()}
    assert before["icloud"]["imap_connectable"] is True
    assert before["icloud"]["authenticated"] is False

    _connect_icloud(c, h)
    after = {a["provider"]: a for a in c.get("/api/v1/integrations/connected-apps", headers=h).json()}
    assert after["icloud"]["authenticated"] is True
    assert after["icloud"]["method"] == "imap"
    assert after["icloud"]["account_label"] == "me@icloud.com"


def test_revoke_icloud_disconnects():
    state, c = _app()
    h = _auth(c)
    _connect_icloud(c, h)
    r = c.delete("/api/v1/integrations/icloud", headers=h)
    assert r.status_code == 204
    assert c.get("/api/v1/integrations", headers=h).json() == []


# --- scan -------------------------------------------------------------------
def test_scan_icloud_requires_connection():
    _, c = _app()
    h = _auth(c)
    r = c.post("/api/v1/inbox/scan?source=icloud", headers=h)
    assert r.status_code == 400 and "connect icloud first" in r.text.lower()


def test_scan_icloud_ingests_job_email(monkeypatch):
    # Connected iCloud + a stubbed mailbox that returns the sample job emails → the
    # scan classifies and ingests them (same pipeline as Gmail, offline).
    _, c = _app()
    h = _auth(c)
    _connect_icloud(c, h)
    import jobsearch.engines.sourcing.imap_source as imap_mod
    monkeypatch.setattr(imap_mod, "build_imap_source", lambda *a, **k: MockJobMailSource())

    r = c.post("/api/v1/inbox/scan?source=icloud", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "icloud"
    assert body["fetched"] == 4 and body["job_found"] >= 1


# --- scheduler reap ---------------------------------------------------------
def test_reap_imap_skips_users_without_a_connection():
    from jobsearch.scheduler import reap_imap

    state, c = _app()
    _auth(c)  # a user, but no iCloud connected → no network, nothing ingested
    assert reap_imap(state) == 0


def test_reap_imap_reads_connected_icloud_into_the_inbox(monkeypatch):
    from jobsearch import scheduler

    state, c = _app()
    h = _auth(c)
    _connect_icloud(c, h)
    uid = state.user_by_email("u@x.com").id
    import jobsearch.engines.sourcing.imap_source as imap_mod
    monkeypatch.setattr(imap_mod, "build_imap_source", lambda *a, **k: MockJobMailSource())

    before = len(state.inbox.list(uid))
    scheduler.reap_imap(state)  # best-effort count; the proof is the filed job mail
    assert len(state.inbox.list(uid)) > before
