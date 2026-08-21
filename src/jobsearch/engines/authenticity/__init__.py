"""Shared job-authenticity ledger — real vs dubious vs scam, as community feedback."""

from jobsearch.engines.authenticity.employer import (
    EmployerVerifier,
    HttpEmployerVerifier,
    MockEmployerVerifier,
    build_employer_verifier,
)
from jobsearch.engines.authenticity.engine import JobAuthenticityEngine, norm_key

__all__ = [
    "EmployerVerifier",
    "HttpEmployerVerifier",
    "JobAuthenticityEngine",
    "MockEmployerVerifier",
    "build_employer_verifier",
    "norm_key",
]
