"""Engine 4 — Authenticity Verification (fraud scoring for job postings)."""

from jobsearch.engines.verification.engine import (
    VerificationContext,
    VerificationEngine,
)
from jobsearch.engines.verification.signals import SignalHit

__all__ = [
    "SignalHit",
    "VerificationContext",
    "VerificationEngine",
]
