"""Engine 1 — User-Authorized Integration (OAuth 2.0)."""

from jobsearch.engines.integration.engine import (
    AuthorizationRequest,
    IntegrationEngine,
    TokenExchanger,
)
from jobsearch.engines.integration.exchangers import (
    HttpxTokenExchanger,
    MockTokenExchanger,
)
from jobsearch.engines.integration.google_drive import (
    DriveAuthError,
    DriveFile,
    DriveUploader,
    DriveUploadError,
    HttpxDriveUploader,
    MockDriveUploader,
    build_drive_uploader,
)
from jobsearch.engines.integration.linkedin_profile import (
    LinkedInProfileProvider,
    MockLinkedInProfileProvider,
    build_linkedin_provider,
    map_claims_to_profile,
    parse_export_text,
)
from jobsearch.engines.integration.providers import PROVIDER_REGISTRY, ProviderConfig

__all__ = [
    "AuthorizationRequest",
    "DriveAuthError",
    "DriveFile",
    "DriveUploadError",
    "DriveUploader",
    "HttpxDriveUploader",
    "HttpxTokenExchanger",
    "IntegrationEngine",
    "MockDriveUploader",
    "build_drive_uploader",
    "LinkedInProfileProvider",
    "MockLinkedInProfileProvider",
    "MockTokenExchanger",
    "PROVIDER_REGISTRY",
    "ProviderConfig",
    "TokenExchanger",
    "build_linkedin_provider",
    "map_claims_to_profile",
    "parse_export_text",
]
