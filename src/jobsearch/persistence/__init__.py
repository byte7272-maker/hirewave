"""SQL persistence — a database-backed implementation of the repository port.

Design: each domain entity maps to one table with a JSON ``data`` column holding
the full Pydantic payload (Mongo-like schema flexibility) plus a small set of
promoted, indexed columns for the fields callers actually query on (``id``,
``user_id``, ``provider``, ``email``). The :class:`SqlRepository` reconstructs
domain models from the JSON, so persistence stays a drop-in for the in-memory
repositories — no engine or API handler changes required.

Defaults to SQLite (``sqlite:///./data/jobsearch.db``) and switches to
PostgreSQL by changing ``JOBSEARCH_DATABASE_URL``.
"""

from jobsearch.persistence.engine import build_engine, create_schema
from jobsearch.persistence.repositories import Repositories, build_repositories
from jobsearch.persistence.sql_repository import SqlRepository

__all__ = [
    "Repositories",
    "SqlRepository",
    "build_engine",
    "build_repositories",
    "create_schema",
]
