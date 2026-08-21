"""Engine construction and schema creation."""

from __future__ import annotations

import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.pool import StaticPool

from jobsearch.persistence.tables import metadata


def build_engine(url: str) -> Engine:
    """Create a SQLAlchemy engine, with sensible SQLite handling.

    * File-backed SQLite: ensures the parent directory exists and allows access
      from FastAPI's worker threads (``check_same_thread=False``).
    * In-memory SQLite (``sqlite:///:memory:``): keeps one shared connection via
      ``StaticPool`` so the schema and data survive across operations.
    """
    if url.startswith("sqlite"):
        in_memory = ":memory:" in url or url in ("sqlite://", "sqlite:///")
        connect_args = {"check_same_thread": False}
        if in_memory:
            return create_engine(
                url, connect_args=connect_args, poolclass=StaticPool, future=True
            )
        path = url.split("///", 1)[-1]
        if path and path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return create_engine(url, connect_args=connect_args, future=True)
    return create_engine(url, future=True)


def create_schema(engine: Engine) -> None:
    """Create any missing tables (idempotent)."""
    metadata.create_all(engine)
