"""Exposure monitoring (Phase 1) — enrollment, verification, scan, alerts, safety."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.monitoring import (
    MockExposureProvider,
    MockPwnedPasswordsProvider,
    MonitoringEngine,
    PwnedPasswordsProvider,
    build_pwned_provider,
)
from jobsearch.engines.monitoring.engine import mask_email
from jobsearch.models import Notification
from jobsearch.security.crypto import FieldCipher, generate_key


# --- provider ---------------------------------------------------------------
def test_mock_provider_is_deterministic():
    p = MockExposureProvider()
    a = p.check_email("sam@example.com")
    b = p.check_email("sam@example.com")
    assert [x.title for x in a] == [x.title for x in b]  # stable
    assert p.check_email("clean@example.com") == []  # opt-out local part


def test_mask_email():
    assert mask_email("sam.dev@gmail.com").endswith("@gmail.com")
    assert mask_email("sam.dev@gmail.com").startswith("s")
    assert "sam.dev" not in mask_email("sam.dev@gmail.com")


# --- engine -----------------------------------------------------------------
def _engine(**kw):
    return MonitoringEngine(cipher=FieldCipher(generate_key()), **kw)


def test_value_is_encrypted_never_plaintext():
    eng = _engine()
    ident, code = eng.enroll("u1", "Sam@Example.com")
    assert ident.value.startswith("v1:")  # ciphertext
    assert "sam@example.com" not in ident.value
    assert ident.label != "sam@example.com" and "@example.com" in ident.label
    assert code and len(code) == 6


def test_unverified_identifier_is_not_scanned():
    eng = _engine()
    eng.enroll("u1", "sam@example.com")  # not verified
    assert eng.scan("u1") == []  # nothing scanned until ownership is proven


def test_verify_then_scan_creates_findings_and_alerts():
    notes: list[Notification] = []
    eng = _engine(notifier=notes.append)
    ident, code = eng.enroll("u1", "sam@example.com")

    assert eng.verify(ident, "000000") is False  # wrong code
    assert eng.verify(ident, code) is True  # correct
    assert ident.verified is True and ident.code_hash == ""

    findings = eng.scan("u1")
    assert findings  # mock surfaces at least one
    assert all(f.user_id == "u1" for f in findings)
    # Findings store categories, not secrets.
    assert all("password" not in " ".join(f.details.values()) for f in findings if f.details)
    # A security alert was raised per finding.
    assert notes and all(n.type.value == "security_exposure" for n in notes)


def test_scan_is_idempotent():
    eng = _engine()
    ident, code = eng.enroll("u1", "sam@example.com")
    eng.verify(ident, code)
    first = eng.scan("u1")
    second = eng.scan("u1")  # same exposures -> no new findings
    assert len(first) >= 1 and second == []


def test_expired_code_fails():
    from datetime import timedelta
    from jobsearch.models.common import utcnow

    eng = _engine()
    ident, code = eng.enroll("u1", "sam@example.com")
    ident.code_expires_at = utcnow() - timedelta(minutes=1)
    assert eng.verify(ident, code) is False


def test_per_user_cap():
    eng = MonitoringEngine(
        cipher=FieldCipher(generate_key()), settings=Settings(monitoring_max_identifiers=2)
    )
    eng.enroll("u1", "a@example.com")
    eng.enroll("u1", "b@example.com")
    try:
        eng.enroll("u1", "c@example.com")
        assert False, "expected cap"
    except ValueError:
        pass


# --- API --------------------------------------------------------------------
def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client):
    client.post("/api/v1/auth/register", json={"email": "sam@demo.com", "password": "supersecret"})
    tok = client.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_full_flow():
    client = _client()
    h = _auth(client)

    # Enroll -> get a verification code (dev), identifier is masked + unverified.
    enr = client.post("/api/v1/monitoring/identifiers", headers=h, json={"email": "sam@example.com"})
    assert enr.status_code == 201
    data = enr.json()
    code = data["verification_code"]
    ident_id = data["identifier"]["id"]
    assert data["identifier"]["verified"] is False
    assert "sam@example.com" not in data["identifier"]["label"]

    # Scanning before verification finds nothing.
    assert client.post("/api/v1/monitoring/scan", headers=h).json()["new_findings"] == 0

    # Verify ownership.
    v = client.post(f"/api/v1/monitoring/identifiers/{ident_id}/verify", headers=h, json={"code": code})
    assert v.status_code == 200 and v.json()["verified"] is True

    # Now scanning surfaces findings + alerts.
    scan = client.post("/api/v1/monitoring/scan", headers=h).json()
    assert scan["new_findings"] >= 1
    findings = client.get("/api/v1/monitoring/findings", headers=h).json()
    assert len(findings) == scan["new_findings"]
    fid = findings[0]["id"]

    # A SECURITY_EXPOSURE notification was raised.
    notes = client.get("/api/v1/notifications", headers=h).json()
    assert any(n["type"] == "security_exposure" for n in notes)

    # Acknowledge a finding.
    ack = client.put(f"/api/v1/monitoring/findings/{fid}/acknowledge", headers=h)
    assert ack.status_code == 200 and ack.json()["acknowledged"] is True

    # Remove the identifier -> its findings are purged.
    assert client.delete(f"/api/v1/monitoring/identifiers/{ident_id}", headers=h).status_code == 204
    assert client.get("/api/v1/monitoring/findings", headers=h).json() == []


def test_api_invalid_email_and_wrong_code():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/monitoring/identifiers", headers=h, json={"email": "nope"}).status_code == 400

    enr = client.post("/api/v1/monitoring/identifiers", headers=h, json={"email": "x@y.com"}).json()
    bad = client.post(
        f"/api/v1/monitoring/identifiers/{enr['identifier']['id']}/verify",
        headers=h,
        json={"code": "123456"},
    )
    assert bad.status_code == 400


# --- Phase 2: password exposure (k-anonymity) -------------------------------
import hashlib


def _pwned_seed(password: str, count: int) -> tuple[str, str, dict]:
    h = hashlib.sha1(password.encode()).hexdigest().upper()
    prefix, suffix = h[:5], h[5:]
    body = f"00000000000000000000000000000000001:3\n{suffix}:{count}\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2"
    return prefix, suffix, {prefix: body}


def test_password_range_engine_returns_suffixes():
    prefix, suffix, seed = _pwned_seed("password", 99999)
    eng = MonitoringEngine(pwned=MockPwnedPasswordsProvider(seeded=seed))
    body = eng.password_range(prefix)
    # A client would match its suffix locally:
    counts = {ln.split(":")[0]: int(ln.split(":")[1]) for ln in body.splitlines()}
    assert counts[suffix] == 99999  # "password" is heavily pwned


def _client_with_pwned(seed):
    from jobsearch.api.state import AppState

    st = AppState(exchanger=MockTokenExchanger())
    st.monitoring.pwned = MockPwnedPasswordsProvider(seeded=seed)
    return TestClient(create_app(state=st))


def test_api_password_range_flow():
    prefix, suffix, seed = _pwned_seed("password", 99999)
    client = _client_with_pwned(seed)
    h = _auth(client)

    r = client.get(f"/api/v1/monitoring/password-range/{prefix}", headers=h)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    # The full hash/password never left the client; only the 5-char prefix did.
    counts = {ln.split(":")[0]: int(ln.split(":")[1]) for ln in r.text.splitlines()}
    assert counts[suffix] == 99999


def test_api_password_range_rejects_non_prefix():
    client = _client_with_pwned({})
    h = _auth(client)
    # Anything that isn't exactly 5 hex chars is refused — can't smuggle a hash.
    for bad in ["nothex", "5BAA61E4C9", "5BA", "ZZZZZ"]:
        assert client.get(f"/api/v1/monitoring/password-range/{bad}", headers=h).status_code == 400


def test_api_password_range_requires_auth():
    client = _client_with_pwned({})
    assert client.get("/api/v1/monitoring/password-range/5BAA6").status_code == 401


def test_build_pwned_provider_offline_by_default():
    # Default (mock) config must NOT reach the network — it returns the seeded
    # offline provider so the password check works without internet.
    provider = build_pwned_provider(Settings(exposure_provider="mock"))
    assert isinstance(provider, MockPwnedPasswordsProvider)
    # "password" -> SHA1 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 must resolve.
    body = provider.range("5BAA6")
    counts = {ln.split(":")[0]: int(ln.split(":")[1]) for ln in body.splitlines()}
    assert counts["1E4C9B93F3F0682250B6CF8331B7EE68FD8"] > 1_000_000


def test_build_pwned_provider_live_when_hibp_configured():
    provider = build_pwned_provider(Settings(exposure_provider="hibp"))
    assert isinstance(provider, PwnedPasswordsProvider)


def test_default_monitoring_engine_password_check_is_offline():
    # A MonitoringEngine built with default settings must answer the range
    # query from the offline seed rather than raising (the old bug 502'd).
    eng = MonitoringEngine(settings=Settings(exposure_provider="mock"))
    body = eng.password_range("5BAA6")
    assert "1E4C9B93F3F0682250B6CF8331B7EE68FD8" in body


def test_api_identifiers_owner_scoped():
    client = _client()
    h1 = _auth(client)
    enr = client.post("/api/v1/monitoring/identifiers", headers=h1, json={"email": "a@b.com"}).json()
    client.post("/api/v1/auth/register", json={"email": "eve@demo.com", "password": "supersecret"})
    tok = client.post(
        "/api/v1/auth/login", json={"email": "eve@demo.com", "password": "supersecret"}
    ).json()
    h2 = {"Authorization": f"Bearer {tok['access_token']}"}
    assert (
        client.delete(f"/api/v1/monitoring/identifiers/{enr['identifier']['id']}", headers=h2).status_code
        == 404
    )
