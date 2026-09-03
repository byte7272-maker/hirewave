"""Per-user feedback loop that nudges match weights over time.

The plan calls for reinforcement from user signals (save / dismiss / apply).
This is a lightweight, transparent implementation: each signal shifts the
per-user weight vector toward the components that scored high on *liked* jobs
and away from components that scored high on *dismissed* ones, then re-normalizes.
It is intentionally simple and inspectable rather than an opaque RL model.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from jobsearch.engines.matching.scoring import MatchBreakdown, MatchWeights


class FeedbackSignal(str, Enum):
    SAVE = "save"
    APPLY = "apply"
    DISMISS = "dismiss"


# How strongly each signal moves the weights.
_SIGNAL_GAIN = {
    FeedbackSignal.APPLY: 0.06,
    FeedbackSignal.SAVE: 0.03,
    FeedbackSignal.DISMISS: -0.04,
}


class FeedbackStore:
    """Holds and updates per-user :class:`MatchWeights`."""

    def __init__(self, default: MatchWeights | None = None) -> None:
        self._default = default or MatchWeights()
        self._weights: dict[str, MatchWeights] = {}

    def weights_for(self, user_id: str) -> MatchWeights:
        return self._weights.get(user_id, self._default)

    def record(
        self, user_id: str, breakdown: MatchBreakdown, signal: FeedbackSignal
    ) -> MatchWeights:
        """Update the user's weights given how a job they reacted to scored."""
        w = self.weights_for(user_id)
        gain = _SIGNAL_GAIN[signal]
        # Move each weight in proportion to that component's contribution to the
        # job the user reacted to: reward drivers of liked jobs, penalize drivers
        # of dismissed ones.
        updated = MatchWeights(
            semantic=max(0.01, w.semantic + gain * breakdown.semantic),
            skills=max(0.01, w.skills + gain * breakdown.skills),
            location=max(0.01, w.location + gain * breakdown.location),
            salary=max(0.01, w.salary + gain * breakdown.salary),
            seniority=max(0.01, w.seniority + gain * breakdown.seniority),
            recency=max(0.01, w.recency + gain * breakdown.recency),
        ).normalized()
        self._weights[user_id] = updated
        return updated
