from datetime import timedelta

import pytest

from jobsearch.engines.integration import IntegrationEngine, MockTokenExchanger
from jobsearch.engines.integration.engine import IntegrationError
from jobsearch.models import Provider
from jobsearch.models.common import utcnow
from jobsearch.store import TokenStore


@pytest.fixture
def engine() -> IntegrationEngine:
    return IntegrationEngine(exchanger=MockTokenExchanger())


def test_authorization_request_has_state_and_pkce_for_google(engine):
    req = engine.build_authorization_request(Provider.GMAIL)
    assert req.state
    assert req.code_verifier  # Google uses PKCE
    assert "code_challenge=" in req.authorize_url
    assert "access_type=offline" in req.authorize_url


def test_linkedin_has_no_pkce(engine):
    req = engine.build_authorization_request(Provider.LINKEDIN)
    assert req.code_verifier == ""
    assert "code_challenge" not in req.authorize_url


def test_complete_authorization_stores_encrypted_token(engine):
    token = engine.complete_authorization(
        "usr_1", Provider.LINKEDIN, code="abc", code_verifier=""
    )
    # Stored value is ciphertext, not the plaintext mock token.
    assert token.access_token.startswith("v1:")
    assert "mock-access" not in token.access_token
    # But the engine can reveal a usable access token.
    assert engine.get_access_token("usr_1", Provider.LINKEDIN).startswith("mock-access")


def test_list_and_revoke(engine):
    engine.complete_authorization("usr_1", Provider.LINKEDIN, code="abc")
    engine.complete_authorization("usr_1", Provider.INDEED, code="def")
    conns = engine.list_connections("usr_1")
    assert {c["provider"] for c in conns} == {"linkedin", "indeed"}
    assert engine.revoke("usr_1", Provider.LINKEDIN) is True
    assert {c["provider"] for c in engine.list_connections("usr_1")} == {"indeed"}


def test_expired_token_is_refreshed(engine):
    engine.complete_authorization("usr_1", Provider.INDEED, code="abc")
    rec = engine.tokens.get_record("usr_1", Provider.INDEED)
    rec.expires_at = utcnow() - timedelta(minutes=5)  # force expiry
    access = engine.get_access_token("usr_1", Provider.INDEED)
    assert access.endswith("refreshed")


def test_missing_connection_raises(engine):
    with pytest.raises(IntegrationError):
        engine.get_access_token("nobody", Provider.WORKDAY)
