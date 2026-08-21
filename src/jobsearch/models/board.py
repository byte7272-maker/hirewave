"""Message boards / groups — shared channels where members post and share jobs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel, new_id, utcnow


def member_key(board_id: str, user_id: str) -> str:
    return f"{board_id}|{user_id}"


class Board(DomainModel):
    id: str = Field(default_factory=lambda: new_id("brd_"))
    name: str
    description: str = ""
    owner_id: str
    is_public: bool = True  # discoverable + join without a code
    join_code: str = ""  # share code to join a private board
    member_count: int = 1
    created_at: datetime = Field(default_factory=utcnow)


class BoardMember(DomainModel):
    id: str = Field(default_factory=lambda: new_id("bmem_"))
    board_id: str
    user_id: str
    key: str = ""  # member_key(board_id, user_id) — indexed for membership checks
    joined_at: datetime = Field(default_factory=utcnow)


class BoardPost(DomainModel):
    id: str = Field(default_factory=lambda: new_id("bpost_"))
    board_id: str
    user_id: str
    body: str = ""
    shared_job_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
