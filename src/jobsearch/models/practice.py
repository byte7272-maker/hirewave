"""Peer practice interviews — two connected users over WebRTC video.

The signalling (SDP offer/answer + ICE candidates) rides over REST: each peer
posts messages for the other, who polls and consumes them. No AI persona — real
people take turns as interviewer and candidate.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


class PracticeStatus(str, Enum):
    WAITING = "waiting"  # invited, not yet accepted
    ACTIVE = "active"  # both joined
    ENDED = "ended"


class PracticeSession(DomainModel):
    id: str = Field(default_factory=lambda: new_id("prac_"))
    host_id: str  # the inviter — the WebRTC *offerer*
    guest_id: str
    status: PracticeStatus = PracticeStatus.WAITING
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PracticeSignal(DomainModel):
    """One signalling message in a peer's mailbox (consumed on poll)."""

    id: str = Field(default_factory=lambda: new_id("sig_"))
    session_id: str
    to_user_id: str  # who should receive it
    from_user_id: str
    kind: str  # "offer" | "answer" | "ice" | "bye"
    payload: str = ""  # JSON string (SDP / ICE candidate)
    created_at: datetime = Field(default_factory=utcnow)
