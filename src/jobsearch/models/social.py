"""Peer connections + direct messaging (invite → connect → message/share)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


def pair_key(a: str, b: str) -> str:
    """Stable key for the unordered pair {a, b} — the DM thread id."""
    return "|".join(sorted([a, b]))


class InviteStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class Invite(DomainModel):
    id: str = Field(default_factory=lambda: new_id("inv_"))
    from_user_id: str
    code: str  # short share code the inviter passes along
    status: InviteStatus = InviteStatus.PENDING
    accepted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Connection(DomainModel):
    id: str = Field(default_factory=lambda: new_id("conn_"))
    user_a: str
    user_b: str
    key: str = ""  # pair_key(user_a, user_b) — indexed for lookup
    created_at: datetime = Field(default_factory=utcnow)


class DirectMessage(DomainModel):
    id: str = Field(default_factory=lambda: new_id("msg_"))
    thread_key: str  # pair_key(from, to)
    from_user_id: str
    to_user_id: str
    body: str = ""
    shared_job_id: Optional[str] = None  # a job posting shared in the message
    is_read: bool = False
    created_at: datetime = Field(default_factory=utcnow)
