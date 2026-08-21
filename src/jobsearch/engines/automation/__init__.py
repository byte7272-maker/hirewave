"""Engine 5 — Application Automation (submit after user approval)."""

from jobsearch.engines.automation.adapters import (
    ApplicationAdapter,
    ApplicationContext,
    BrowserApplyAdapter,
    EmailAdapter,
    GreenhouseAdapter,
    IndeedAdapter,
    LinkedInAdapter,
    SubmissionResult,
    WorkdayAdapter,
)
from jobsearch.engines.automation.browser import (
    BrowserDriver,
    FillOutcome,
    application_fields,
)
from jobsearch.engines.automation.engine import (
    ApprovalRequiredError,
    AutomationEngine,
    NoAdapterError,
    RateLimitError,
)
from jobsearch.engines.automation.gmail import (
    Attachment,
    GmailClient,
    build_raw_message,
)

__all__ = [
    "ApplicationAdapter",
    "ApplicationContext",
    "ApprovalRequiredError",
    "Attachment",
    "AutomationEngine",
    "BrowserApplyAdapter",
    "BrowserDriver",
    "EmailAdapter",
    "FillOutcome",
    "GmailClient",
    "GreenhouseAdapter",
    "IndeedAdapter",
    "LinkedInAdapter",
    "NoAdapterError",
    "RateLimitError",
    "SubmissionResult",
    "WorkdayAdapter",
    "application_fields",
    "build_raw_message",
]
