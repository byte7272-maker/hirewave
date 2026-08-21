"""Engine 3 — Job Matching (semantic + weighted scoring + feedback learning)."""

from jobsearch.engines.matching.engine import MatchingEngine
from jobsearch.engines.matching.feedback import FeedbackSignal, FeedbackStore
from jobsearch.engines.matching.scoring import MatchBreakdown, MatchResult, MatchWeights

__all__ = [
    "FeedbackSignal",
    "FeedbackStore",
    "MatchBreakdown",
    "MatchResult",
    "MatchWeights",
    "MatchingEngine",
]
