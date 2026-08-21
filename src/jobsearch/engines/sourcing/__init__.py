"""Multi-site job sourcing — the agent that ingests postings from job boards."""

from jobsearch.engines.sourcing.aggregator import AggregationResult, JobAggregator
from jobsearch.engines.sourcing.email_import import ParsedAlert, parse_job_alert
from jobsearch.engines.sourcing.saved_search import SavedSearchEngine
from jobsearch.engines.sourcing.sources import (
    HttpAggregatorJobSource,
    JobQuery,
    JobSource,
    MockJobSource,
    build_job_sources,
)

__all__ = [
    "AggregationResult",
    "HttpAggregatorJobSource",
    "JobAggregator",
    "JobQuery",
    "JobSource",
    "MockJobSource",
    "ParsedAlert",
    "SavedSearchEngine",
    "build_job_sources",
    "parse_job_alert",
]
