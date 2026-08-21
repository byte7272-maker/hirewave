"""Shared model helpers: id generation, timestamps, base config."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict


def new_id(prefix: str = "") -> str:
    """A short, URL-safe unique id, optionally namespaced (e.g. ``usr_``)."""
    return f"{prefix}{uuid.uuid4().hex}"


def utcnow() -> datetime:
    """Timezone-aware current UTC time (all model timestamps are UTC)."""
    return datetime.now(timezone.utc)


class DomainModel(BaseModel):
    """Base for domain entities: validated on assignment, tolerant of extra I/O."""

    model_config = ConfigDict(
        validate_assignment=True,
        use_enum_values=False,
        populate_by_name=True,
    )
