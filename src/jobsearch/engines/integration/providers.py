"""OAuth provider metadata (least-privilege scopes, endpoints, PKCE support).

Endpoint URLs and scopes reflect each provider's public OAuth 2.0
documentation at time of writing. They are configuration, not secrets — client
id/secret come from the environment via :meth:`Settings.provider_credentials`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from jobsearch.models import Provider


@dataclass(frozen=True)
class ProviderConfig:
    provider: Provider
    authorize_url: str
    token_url: str
    revoke_url: str = ""
    default_scopes: tuple[str, ...] = ()
    use_pkce: bool = True
    #: Some providers require a static ``access_type=offline`` etc. for refresh tokens.
    extra_authorize_params: dict[str, str] = field(default_factory=dict)


PROVIDER_REGISTRY: dict[Provider, ProviderConfig] = {
    Provider.LINKEDIN: ProviderConfig(
        provider=Provider.LINKEDIN,
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        default_scopes=("openid", "profile", "email", "w_member_social"),
        use_pkce=False,  # LinkedIn uses classic code flow with client_secret
    ),
    Provider.GMAIL: ProviderConfig(
        provider=Provider.GMAIL,
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        revoke_url="https://oauth2.googleapis.com/revoke",
        default_scopes=(
            "openid",
            "email",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        ),
        use_pkce=True,
        extra_authorize_params={"access_type": "offline", "prompt": "consent"},
    ),
    Provider.GOOGLE_DRIVE: ProviderConfig(
        provider=Provider.GOOGLE_DRIVE,
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        revoke_url="https://oauth2.googleapis.com/revoke",
        default_scopes=(
            "openid",
            "https://www.googleapis.com/auth/drive.file",
        ),
        use_pkce=True,
        extra_authorize_params={"access_type": "offline", "prompt": "consent"},
    ),
    Provider.INDEED: ProviderConfig(
        provider=Provider.INDEED,
        authorize_url="https://secure.indeed.com/oauth/v2/authorize",
        token_url="https://apis.indeed.com/oauth/v2/tokens",
        default_scopes=("email", "offline_access"),
        use_pkce=True,
    ),
    Provider.GREENHOUSE: ProviderConfig(
        provider=Provider.GREENHOUSE,
        authorize_url="https://app.greenhouse.io/oauth/authorize",
        token_url="https://app.greenhouse.io/oauth/token",
        default_scopes=("candidates.create", "jobs.view"),
        use_pkce=False,
    ),
    Provider.WORKDAY: ProviderConfig(
        provider=Provider.WORKDAY,
        # Workday endpoints are tenant-specific; these are placeholders that a
        # deployment overrides per customer tenant host.
        authorize_url="https://{tenant}.workday.com/oauth2/authorize",
        token_url="https://{tenant}.workday.com/oauth2/token",
        default_scopes=("staffing", "recruiting"),
        use_pkce=True,
    ),
}


def get_provider_config(provider: Provider) -> ProviderConfig:
    try:
        return PROVIDER_REGISTRY[provider]
    except KeyError as exc:  # pragma: no cover - guarded by enum
        raise ValueError(f"unsupported provider: {provider}") from exc
