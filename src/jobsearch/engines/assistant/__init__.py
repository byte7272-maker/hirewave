"""Permissioned automation assistant — consent-gated auto form-fill + audit."""

from jobsearch.engines.assistant.auto_apply import (
    AutoApplyEngine,
    JobOutcome,
    QueueItem,
    RunResult,
)
from jobsearch.engines.assistant.draft_prep import DraftPrepEngine
from jobsearch.engines.assistant.engine import AssistantEngine, demo_application_form
from jobsearch.engines.assistant.form_fill import (
    FillEntry,
    FillPlan,
    FormField,
    FormFillEngine,
)
from jobsearch.engines.assistant.live_fill import (
    LiveFillEngine,
    LiveFillResult,
    MockBrowserDriver,
    build_browser_driver,
)

__all__ = [
    "AssistantEngine",
    "AutoApplyEngine",
    "JobOutcome",
    "QueueItem",
    "RunResult",
    "DraftPrepEngine",
    "FillEntry",
    "FillPlan",
    "FormField",
    "FormFillEngine",
    "LiveFillEngine",
    "LiveFillResult",
    "MockBrowserDriver",
    "build_browser_driver",
    "demo_application_form",
]
