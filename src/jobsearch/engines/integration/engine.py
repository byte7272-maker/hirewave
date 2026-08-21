"""IntegrationEngine — OAuth 2.0 authorization + encrypted token lifecycle.

Flow (section 6.1)::

    build_authorization_request()  ->  user is sent to provider consent screen
    complete_authorization()       ->  exchange code, AES-256 encrypt, store
    get_access_token()             ->  decrypt + auto-refresh when expiring
    list_connections() / revoke()  ->  user-facing management

The network boundary (token endpoint) is injected as a ``TokenExchanger`` so
the flow is fully testable offline with :class:`MockTokenExchanger`.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Optional, Protocol, runtime_checkable
from urllib.parse import urlencode

from jobsearch.config import Settings, get_settings
from jobsearch.engines.integration.exchangers import (
    MockTokenExchanger,
    TokenExchangeError,
    TokenResponse,
)
from jobsearch.engines.integration.providers import ProviderConfig, get_provider_config
from jobsearch.models import OAuthToken, Provider
from jobsearch.models.common import utcnow
from jobsearch.store import TokenStore


@runtime_checkable
class TokenExchanger(Protocol):
    def exchange_code(
        self, config: ProviderConfig, *, code: str, redirect_uri: str,
        client_id: str, client_secret: str, code_verifier: str = "",
    ) -> TokenResponse: ...

    def refresh(
        self, config: ProviderConfig, *, refresh_token: str,
        client_id: str, client_secret: str,
    ) -> TokenResponse: ...


@dataclass
class AuthorizationRequest:
    """Everything needed to send a user to consent and later resume the flow.

    ``state`` and ``code_verifier`` are secrets the caller must stash server-side
    (keyed by ``state``) until the provider redirects back — never expose the
    verifier to the browser.
    """

    provider: Provider
    authorize_url: str
    state: str
    code_verifier: str = ""
    redirect_uri: str = ""
    scopes: tuple[str, ...] = field(default_factory=tuple)


class IntegrationError(RuntimeError):
    pass


def _pkce_pair() -> tuple[str, str]:
    """Return ``(code_verifier, code_challenge)`` using S256."""
    verifier = base64.urlsafe_b64encode(os.urandom(40)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


class IntegrationEngine:
    def __init__(
        self,
        *,
        token_store: Optional[TokenStore] = None,
        exchanger: Optional[TokenExchanger] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.tokens = token_store or TokenStore()
        self.exchanger: TokenExchanger = exchanger or MockTokenExchanger()

    # -- authorization ------------------------------------------------------
    def build_authorization_request(
        self,
        provider: Provider,
        *,
        scopes: Optional[list[str]] = None,
        redirect_uri: Optional[str] = None,
        tenant: Optional[str] = None,
    ) -> AuthorizationRequest:
        config = get_provider_config(provider)
        client_id, client_secret = self.settings.provider_credentials(provider.value)
        if self.settings.oauth_mode == "live" and not (client_id and client_secret):
            raise IntegrationError(
                f"{provider.value} OAuth is not configured — set its "
                "client id/secret in the environment (see .env.example; Gmail and "
                "Google Drive share GOOGLE_CLIENT_ID/SECRET)"
            )
        redirect = redirect_uri or f"{self.settings.oauth_redirect_base}/{provider.value}"
        requested = tuple(scopes) if scopes else config.default_scopes
        state = secrets.token_urlsafe(24)

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect,
            "scope": " ".join(requested),
            "state": state,
            **config.extra_authorize_params,
        }

        verifier = ""
        if config.use_pkce:
            verifier, challenge = _pkce_pair()
            params["code_challenge"] = challenge
            params["code_challenge_method"] = "S256"

        authorize_url = config.authorize_url
        if tenant:
            authorize_url = authorize_url.format(tenant=tenant)
        url = f"{authorize_url}?{urlencode(params)}"

        return AuthorizationRequest(
            provider=provider,
            authorize_url=url,
            state=state,
            code_verifier=verifier,
            redirect_uri=redirect,
            scopes=requested,
        )

    def complete_authorization(
        self,
        user_id: str,
        provider: Provider,
        *,
        code: str,
        code_verifier: str = "",
        redirect_uri: Optional[str] = None,
        tenant: Optional[str] = None,
    ) -> OAuthToken:
        """Exchange the authorization code and persist encrypted tokens."""
        config = get_provider_config(provider)
        client_id, client_secret = self.settings.provider_credentials(provider.value)
        redirect = redirect_uri or f"{self.settings.oauth_redirect_base}/{provider.value}"
        cfg = config
        if tenant:
            cfg = ProviderConfig(
                provider=config.provider,
                authorize_url=config.authorize_url.format(tenant=tenant),
                token_url=config.token_url.format(tenant=tenant),
                revoke_url=config.revoke_url,
                default_scopes=config.default_scopes,
                use_pkce=config.use_pkce,
                extra_authorize_params=config.extra_authorize_params,
            )
        try:
            resp = self.exchanger.exchange_code(
                cfg,
                code=code,
                redirect_uri=redirect,
                client_id=client_id,
                client_secret=client_secret,
                code_verifier=code_verifier,
            )
        except TokenExchangeError as exc:
            raise IntegrationError(
                f"failed to connect {provider.value}: {exc}"
            ) from exc
        return self._store(user_id, provider, resp)

    # -- token access -------------------------------------------------------
    def get_access_token(self, user_id: str, provider: Provider) -> str:
        """Return a valid decrypted access token, refreshing if near expiry."""
        rec = self.tokens.get_record(user_id, provider)
        if rec is None:
            raise IntegrationError(f"{provider.value} is not connected for this user")
        if rec.is_expired():
            rec = self._refresh(user_id, provider, rec)
        revealed = self.tokens.reveal(user_id, provider)
        assert revealed is not None
        return revealed[0]

    def _refresh(self, user_id: str, provider: Provider, rec: OAuthToken) -> OAuthToken:
        revealed = self.tokens.reveal(user_id, provider)
        if not revealed or not revealed[1]:
            raise IntegrationError(
                f"{provider.value} token expired and no refresh token available — "
                "user must re-authenticate"
            )
        config = get_provider_config(provider)
        client_id, client_secret = self.settings.provider_credentials(provider.value)
        try:
            resp = self.exchanger.refresh(
                config,
                refresh_token=revealed[1],
                client_id=client_id,
                client_secret=client_secret,
            )
        except TokenExchangeError as exc:
            raise IntegrationError(
                f"{provider.value} token refresh failed — user must re-authenticate: {exc}"
            ) from exc
        # Providers often omit a new refresh token on refresh — keep the old one.
        if not resp.refresh_token:
            resp.refresh_token = revealed[1]
        return self._store(user_id, provider, resp)

    # -- management ---------------------------------------------------------
    def list_connections(self, user_id: str) -> list[dict]:
        """User-facing list of connected providers (never exposes token bytes)."""
        out = []
        for rec in self.tokens.list_providers(user_id):
            out.append(
                {
                    "provider": rec.provider.value,
                    "scopes": rec.scopes,
                    "connected_at": rec.created_at.isoformat(),
                    "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
                    "expired": rec.is_expired(),
                }
            )
        return out

    def revoke(self, user_id: str, provider: Provider) -> bool:
        return self.tokens.delete(user_id, provider)

    # -- internals ----------------------------------------------------------
    def _store(self, user_id: str, provider: Provider, resp: TokenResponse) -> OAuthToken:
        if not resp.access_token:
            raise IntegrationError("token endpoint returned no access_token")
        expires_at = None
        if resp.expires_in:
            expires_at = utcnow() + timedelta(seconds=resp.expires_in)
        scopes = resp.scope.split() if resp.scope else None
        return self.tokens.save(
            user_id=user_id,
            provider=provider,
            access_token=resp.access_token,
            refresh_token=resp.refresh_token,
            scopes=scopes,
            expires_at=expires_at,
        )
