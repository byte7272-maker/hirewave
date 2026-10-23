"""Multiple email inboxes: a user can connect several Gmail accounts; each is a
distinct credential, the reap reads them all, and they can be removed one at a
time — without disturbing the others."""

from __future__ import annotations

from jobsearch.engines.integration.engine import IntegrationEngine
from jobsearch.engines.integration.exchangers import MockTokenExchanger, TokenResponse
from jobsearch.models import Provider
from jobsearch.store import TokenStore


class _EmailExchanger(MockTokenExchanger):
    """Mock OAuth where the ``code`` *is* the account email, surfaced in ``raw`` so
    the engine derives account_email exactly as it would from a real id_token."""

    def exchange_code(self, config, *, code, **kw) -> TokenResponse:
        return TokenResponse(
            access_token=f"access-{config.provider.value}-{code}",
            refresh_token=f"refresh-{code}",
            expires_in=3600,
            scope=" ".join(config.default_scopes),
            raw={"email": code},
        )


def _engine() -> IntegrationEngine:
    return IntegrationEngine(token_store=TokenStore(), exchanger=_EmailExchanger())


def test_connect_two_gmail_inboxes_are_both_kept():
    eng = _engine()
    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")
    eng.complete_authorization("u1", Provider.GMAIL, code="bob@work.com")

    conns = [c for c in eng.list_connections("u1") if c["provider"] == "gmail"]
    emails = sorted(c["account_email"] for c in conns)
    assert emails == ["alice@gmail.com", "bob@work.com"]

    # The reap sees BOTH inboxes, each with its own live token.
    pairs = eng.inbox_tokens("u1", Provider.GMAIL)
    assert sorted(e for e, _ in pairs) == ["alice@gmail.com", "bob@work.com"]
    assert all(tok for _, tok in pairs)


def test_reconnecting_same_inbox_does_not_duplicate():
    eng = _engine()
    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")
    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")  # re-auth
    conns = [c for c in eng.list_connections("u1") if c["provider"] == "gmail"]
    assert len(conns) == 1


def test_remove_one_inbox_leaves_the_other():
    eng = _engine()
    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")
    eng.complete_authorization("u1", Provider.GMAIL, code="bob@work.com")

    assert eng.revoke("u1", Provider.GMAIL, account_email="alice@gmail.com") is True
    remaining = [c["account_email"] for c in eng.list_connections("u1") if c["provider"] == "gmail"]
    assert remaining == ["bob@work.com"]
    # Bob's token still resolves.
    assert eng.get_access_token("u1", Provider.GMAIL, account_email="bob@work.com")


def test_revoke_without_email_disconnects_all_inboxes():
    eng = _engine()
    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")
    eng.complete_authorization("u1", Provider.GMAIL, code="bob@work.com")
    assert eng.revoke("u1", Provider.GMAIL) is True
    assert [c for c in eng.list_connections("u1") if c["provider"] == "gmail"] == []


def test_legacy_record_without_email_is_adopted_not_duplicated():
    """A connection stored before this feature (no account_email) must upgrade in
    place when the same account reconnects — not spawn a second inbox."""
    store = TokenStore()
    # Simulate a pre-existing connection with no email recorded.
    store.save(user_id="u1", provider=Provider.GMAIL, access_token="old", refresh_token="r")
    eng = IntegrationEngine(token_store=store, exchanger=_EmailExchanger())

    eng.complete_authorization("u1", Provider.GMAIL, code="alice@gmail.com")
    accounts = store.list_accounts("u1", Provider.GMAIL)
    assert len(accounts) == 1
    assert accounts[0].account_email == "alice@gmail.com"
