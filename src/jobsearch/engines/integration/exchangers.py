"""Token exchangers — the network boundary of the OAuth flow.

The engine calls a :class:`TokenExchanger` to turn an authorization code (or a
refresh token) into access credentials. ``HttpxTokenExchanger`` performs the
real RFC 6749 token request; ``MockTokenExchanger`` returns deterministic fake
tokens so the whole flow is testable offline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from jobsearch.engines.integration.providers import ProviderConfig


class TokenExchangeError(RuntimeError):
    """Raised when a live token endpoint rejects an exchange/refresh request."""


@dataclass
class TokenResponse:
    access_token: str
    refresh_token: str = ""
    expires_in: Optional[int] = None  # seconds
    scope: str = ""
    token_type: str = "Bearer"
    raw: Optional[dict] = None


class MockTokenExchanger:
    """Offline stand-in — echoes the input into a deterministic token."""

    def exchange_code(
        self, config: ProviderConfig, *, code: str, redirect_uri: str,
        client_id: str, client_secret: str, code_verifier: str = "",
    ) -> TokenResponse:
        return TokenResponse(
            access_token=f"mock-access-{config.provider.value}-{code}",
            refresh_token=f"mock-refresh-{config.provider.value}",
            expires_in=3600,
            scope=" ".join(config.default_scopes),
            raw={"mock": True},
        )

    def refresh(
        self, config: ProviderConfig, *, refresh_token: str,
        client_id: str, client_secret: str,
    ) -> TokenResponse:
        return TokenResponse(
            access_token=f"mock-access-{config.provider.value}-refreshed",
            refresh_token=refresh_token,
            expires_in=3600,
            scope=" ".join(config.default_scopes),
            raw={"mock": True, "refreshed": True},
        )


class HttpxTokenExchanger:
    """Real OAuth 2.0 token endpoint client (RFC 6749)."""

    def __init__(self, timeout: float = 15.0) -> None:
        self._timeout = timeout

    def _post(self, url: str, data: dict) -> TokenResponse:
        import httpx

        try:
            resp = httpx.post(
                url,
                data=data,
                headers={"Accept": "application/json"},
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response is not None else ""
            code = exc.response.status_code if exc.response is not None else "?"
            raise TokenExchangeError(f"token endpoint returned HTTP {code}: {body}") from exc
        except httpx.HTTPError as exc:  # connection/timeout/etc.
            raise TokenExchangeError(f"token endpoint request failed: {exc}") from exc

        payload = resp.json()
        return TokenResponse(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token", ""),
            expires_in=payload.get("expires_in"),
            scope=payload.get("scope", ""),
            token_type=payload.get("token_type", "Bearer"),
            raw=payload,
        )

    def exchange_code(
        self, config: ProviderConfig, *, code: str, redirect_uri: str,
        client_id: str, client_secret: str, code_verifier: str = "",
    ) -> TokenResponse:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        }
        if config.use_pkce and code_verifier:
            data["code_verifier"] = code_verifier
        return self._post(config.token_url, data)

    def refresh(
        self, config: ProviderConfig, *, refresh_token: str,
        client_id: str, client_secret: str,
    ) -> TokenResponse:
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }
        return self._post(config.token_url, data)
