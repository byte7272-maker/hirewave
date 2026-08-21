"""Central configuration, loaded from environment / ``.env``.

Every setting has a safe offline default so the engines are importable and
testable with no external services configured (LLM + embeddings fall back to
deterministic mock providers, automation runs in simulate mode).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProviderName = Literal["anthropic", "openai", "mock"]
EmbeddingProviderName = Literal["openai", "mock"]
AutomationMode = Literal["simulate", "live"]
OAuthMode = Literal["mock", "live"]
ExposureProviderName = Literal["mock", "hibp"]
MediaProviderName = Literal["none", "http"]


class Settings(BaseSettings):
    """Runtime configuration for the engine layer."""

    model_config = SettingsConfigDict(
        env_prefix="JOBSEARCH_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,  # accept field names in addition to env aliases
    )

    # --- LLM / embeddings --------------------------------------------------
    llm_provider: LLMProviderName = "mock"
    embedding_provider: EmbeddingProviderName = "mock"

    # These read from the bare (un-prefixed) vendor env vars by convention.
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-8", validation_alias="ANTHROPIC_MODEL")
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o", validation_alias="OPENAI_MODEL")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small", validation_alias="OPENAI_EMBEDDING_MODEL"
    )
    embedding_dim: int = 512  # dimensionality used by the mock embedder

    # --- Security ----------------------------------------------------------
    encryption_key: str = ""  # base64 or hex 32-byte key; blank -> ephemeral dev key

    # --- OAuth -------------------------------------------------------------
    # "mock" = offline flow with a fake token exchanger (default, dev/tests).
    # "live" = real RFC 6749 token exchange (needs <PROVIDER>_CLIENT_ID/SECRET).
    oauth_mode: OAuthMode = "mock"
    oauth_redirect_base: str = "http://localhost:8000/api/v1/integrations/callback"
    # Where to send the browser after a successful/failed connect. Blank = return
    # JSON (handy for API testing); set to e.g. http://localhost:3000/integrations
    # for the real redirect-based browser flow.
    oauth_success_redirect: str = ""

    # --- Document storage --------------------------------------------------
    # Where uploaded résumé files are stored. Blank = in-memory (per-process);
    # set a directory (backed by a volume/S3) for durable file storage.
    document_dir: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB

    # --- Persistence -------------------------------------------------------
    # SQLAlchemy URL. Blank = in-memory repositories (default; great for tests
    # and the offline demo). Set to persist:
    #   sqlite:///./data/jobsearch.db
    #   postgresql+psycopg://user:pass@host:5432/jobsearch
    database_url: str = ""

    # --- Automation --------------------------------------------------------
    automation_mode: AutomationMode = "simulate"

    # --- Exposure monitoring (defensive, consent-based) --------------------
    # "mock" = offline fake breach data; "hibp" = live Have I Been Pwned API.
    exposure_provider: ExposureProviderName = "mock"
    hibp_api_key: str = Field(default="", validation_alias="HIBP_API_KEY")
    monitoring_max_identifiers: int = 10  # per-user cap (abuse prevention)
    verification_ttl_minutes: int = 15

    # --- Interview media + content (all user-directed, offline by default) ---
    # Everything below is a *pluggable source you point at your own service or
    # files* to upgrade the mock interview. Left at the defaults, the interview
    # runs fully offline with the browser's own voice + animated avatar.
    #
    # Neural voice (TTS): "http" POSTs {text, voice} to your endpoint and expects
    # audio bytes back — front a vendor (ElevenLabs / OpenAI / Azure) or self-host.
    tts_provider: MediaProviderName = "none"
    tts_url: str = ""
    tts_api_key: str = Field(default="", validation_alias="JOBSEARCH_TTS_API_KEY")
    tts_media_type: str = "audio/mpeg"
    tts_timeout_seconds: float = 30.0
    # Neural talking-head video: "http" POSTs {persona, text} and returns
    # {"video_url": "..."} — front D-ID / HeyGen or self-host.
    avatar_provider: MediaProviderName = "none"
    avatar_url: str = ""
    avatar_api_key: str = Field(default="", validation_alias="JOBSEARCH_AVATAR_API_KEY")
    avatar_timeout_seconds: float = 60.0
    # User-directed content libraries — JSON files you own and edit. Blank =
    # the built-in generator / question templates.
    #   persona_library: [{name, role, company, style, gender, voice, voice_id,
    #                      avatar_url, video_url, bio}, ...]
    #   question_bank:    {"<style>": [{category, question}, ...], ...}
    persona_library_path: str = Field(default="", validation_alias="JOBSEARCH_PERSONA_LIBRARY")
    question_bank_path: str = Field(default="", validation_alias="JOBSEARCH_QUESTION_BANK")

    # --- LinkedIn profile import (user-directed) ---------------------------
    # "mock" = deterministic demo profile (offline default — the whole import
    #          flow is testable with no LinkedIn app). "http" = fetch the
    #          connected user's data from LinkedIn's OpenID Connect userinfo
    #          endpoint (or a partner-API proxy you point at), using the
    #          encrypted OAuth token stored when the user connected.
    linkedin_profile_provider: Literal["mock", "http"] = "mock"
    linkedin_profile_url: str = "https://api.linkedin.com/v2/userinfo"
    linkedin_profile_timeout_seconds: float = 20.0

    # --- Multi-site job sourcing (the agent that ingests postings) ---------
    # "mock" = deterministic offline postings (default — the whole aggregation
    # + saved-search flow is testable with no external API). "http" = query a
    # licensed job-search aggregator (one key, many boards) that you point at.
    # Real adapters are user-directed and stay within each source's ToS.
    job_source_provider: Literal["mock", "http"] = "mock"
    job_source_url: str = ""
    job_source_api_key: str = Field(default="", validation_alias="JOBSEARCH_JOB_SOURCE_API_KEY")
    job_source_timeout_seconds: float = 20.0

    # --- Employer-site verification (is the posting really available?) ------
    # "mock" = deterministic offline check (default). "http" = actually fetch the
    # posting URL / company site to confirm the job still exists (best-effort;
    # a signal, not proof — some sites block automated requests).
    employer_verifier: Literal["mock", "http"] = "mock"
    employer_verifier_timeout_seconds: float = 15.0

    # --- Inbox (forward job-alert emails to your account) ------------------
    # Users forward alerts to jobs+<token>@<inbox_domain>; an inbound-email
    # provider (SendGrid/Postmark/Mailgun) POSTs them to /inbox/inbound. The
    # webhook secret gates that endpoint (blank = allow, for local testing).
    inbox_domain: str = "inbox.hirewave.test"
    inbox_webhook_secret: str = Field(default="", validation_alias="JOBSEARCH_INBOX_WEBHOOK_SECRET")
    # Auto-pull job alerts from a connected Gmail inbox (read scope). "mock" =
    # deterministic sample alerts (offline default); "http" = the real Gmail API
    # using the user's OAuth token.
    gmail_fetch: Literal["mock", "http"] = "mock"

    # --- Outbound email (invitations) --------------------------------------
    # "mock" = record the message, don't actually send (offline default). "http"
    # = POST to your email API (SendGrid/Postmark/…). Used for invite-by-email.
    email_sender: Literal["mock", "http"] = "mock"
    email_sender_url: str = ""
    email_sender_api_key: str = Field(default="", validation_alias="JOBSEARCH_EMAIL_SENDER_API_KEY")
    email_from: str = "no-reply@hirewave.test"
    app_base_url: str = "http://localhost:3000"  # for building invite links

    # --- Reminders (review checkpoint / automation nudges) -----------------
    # Out-of-band reminders so the review checkpoint reaches the user when the
    # app is closed. All default to mock (recorded, not sent) so it runs offline.
    # SMS: "http" POSTs {to, from, body} to your SMS API (front Twilio/Vonage/…).
    sms_provider: Literal["mock", "http"] = "mock"
    sms_provider_url: str = ""
    sms_from: str = ""  # sender id / from-number
    sms_api_key: str = Field(default="", validation_alias="JOBSEARCH_SMS_API_KEY")
    # Web Push (VAPID): "webpush" sends via the browser Push service.
    push_provider: Literal["mock", "webpush"] = "mock"
    vapid_public_key: str = ""  # shared with the browser to subscribe
    vapid_private_key: str = Field(default="", validation_alias="JOBSEARCH_VAPID_PRIVATE_KEY")
    vapid_subject: str = "mailto:admin@hirewave.test"
    # Review checkpoint = half the 7-day refresh window; re-send at most this often.
    reminder_review_interval_minutes: int = 5040  # 3.5 days
    reminder_min_gap_minutes: int = 720  # don't re-remind within 12h

    # Browser origins allowed to call the API (CORS). Comma-separated. In
    # production set this to your frontend's real origin(s), e.g. the Readdy /
    # Vercel URL — the default only covers local dev.
    cors_origins: str = "http://localhost:3000"

    # --- Firebase Auth (sign-in without this app handling passwords) --------
    # "mock" = accept a dev token offline (email or JSON claims). "live" = verify
    # real Firebase ID tokens via the Admin SDK (needs `firebase-admin` + a
    # service-account credential). Users log in with Firebase; we exchange the
    # verified token for this app's own session tokens.
    firebase_auth: Literal["mock", "live"] = "mock"
    firebase_project_id: str = ""
    # Provide the service-account either as a file path (VPS) OR as the raw JSON
    # content in an env var (managed hosts like Railway/Cloud Run — no file).
    firebase_credentials_file: str = Field(default="", validation_alias="JOBSEARCH_FIREBASE_CREDENTIALS_FILE")
    firebase_credentials_json: str = Field(default="", validation_alias="JOBSEARCH_FIREBASE_CREDENTIALS_JSON")

    # --- Assistant live browser fill ---------------------------------------
    # "mock" = simulate the fill offline (default, testable). "playwright" =
    # drive a real browser via the `automation` extra, operating on a session
    # the USER established themselves (a storage_state) — never the password.
    assistant_browser: Literal["mock", "playwright"] = "mock"
    assistant_browser_storage_state: str = ""  # path to the user's pre-auth session
    assistant_browser_headless: bool = True

    # --- WebRTC (peer practice interviews) ---------------------------------
    # STUN is always on (public servers). Add a TURN relay for restrictive/
    # symmetric NATs. Preferred: coturn's REST auth — set only `turn_secret`
    # (the coturn `static-auth-secret`) and the server issues short-lived
    # time-limited credentials per user; the static secret never leaves the
    # backend. Alternatively set a static `turn_username`/`turn_password`.
    turn_urls: str = ""  # comma-separated, e.g. "turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349"
    turn_secret: str = Field(default="", validation_alias="JOBSEARCH_TURN_SECRET")
    turn_username: str = ""
    turn_password: str = Field(default="", validation_alias="JOBSEARCH_TURN_PASSWORD")
    turn_ttl_seconds: int = 3600

    def provider_credentials(self, provider: str) -> tuple[str, str]:
        """Return ``(client_id, client_secret)`` for an OAuth *provider*.

        Google-backed providers (gmail, google_drive) share one credential set.
        Missing credentials return empty strings — callers decide whether that
        is fatal (live flow) or acceptable (building an authorize URL for docs).
        """
        import os

        key = {
            "linkedin": "LINKEDIN",
            "gmail": "GOOGLE",
            "google_drive": "GOOGLE",
            "indeed": "INDEED",
            "greenhouse": "GREENHOUSE",
            "workday": "WORKDAY",
        }.get(provider, provider.upper())
        return os.getenv(f"{key}_CLIENT_ID", ""), os.getenv(f"{key}_CLIENT_SECRET", "")


@lru_cache
def get_settings() -> Settings:
    """Process-wide cached settings instance."""
    return Settings()
