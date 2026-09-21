"""Document object storage — where uploaded résumé files live.

A small port (the plan's "S3-compatible object storage" tier) with these
implementations:

* :class:`InMemoryDocumentStore` — default; great for tests and single-process runs.
* :class:`LocalDocumentStore` — filesystem-durable; set ``JOBSEARCH_DOCUMENT_DIR``.
* :class:`RepositoryDocumentStore` — Postgres-durable; the bytes ride in the same
  JSON ``data`` column as every other entity, so uploaded files survive a container
  restart on hosts with an ephemeral disk (e.g. Railway). This is what the API uses
  whenever a database is configured.

Files are keyed by the owning document's id (a résumé/cover-letter id).
"""

from __future__ import annotations

import base64
import os
from typing import TYPE_CHECKING, Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings

if TYPE_CHECKING:
    from jobsearch.models import StoredDocument
    from jobsearch.store import Repository


@runtime_checkable
class DocumentStore(Protocol):
    def put(self, key: str, data: bytes, *, content_type: str = "") -> str: ...
    def get(self, key: str) -> Optional[tuple[bytes, str]]: ...
    def delete(self, key: str) -> bool: ...


class InMemoryDocumentStore:
    def __init__(self) -> None:
        self._items: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, *, content_type: str = "") -> str:
        self._items[key] = (data, content_type)
        return f"memory://{key}"

    def get(self, key: str) -> Optional[tuple[bytes, str]]:
        return self._items.get(key)

    def delete(self, key: str) -> bool:
        return self._items.pop(key, None) is not None


class LocalDocumentStore:
    """Stores each file as ``<base>/<key>`` with a ``.ct`` sidecar for its type.

    The directory is created lazily on first write, so constructing the store is
    side-effect free (important — the API builds one on every request state).
    """

    def __init__(self, base_dir: str) -> None:
        self._base = base_dir

    def _path(self, key: str) -> str:
        # Keys are résumé ids (hex + short prefix) — safe, but guard anyway.
        safe = os.path.basename(key)
        return os.path.join(self._base, safe)

    def put(self, key: str, data: bytes, *, content_type: str = "") -> str:
        os.makedirs(self._base, exist_ok=True)
        path = self._path(key)
        with open(path, "wb") as fh:
            fh.write(data)
        with open(path + ".ct", "w", encoding="utf-8") as fh:
            fh.write(content_type or "")
        return f"file://{os.path.abspath(path)}"

    def get(self, key: str) -> Optional[tuple[bytes, str]]:
        path = self._path(key)
        if not os.path.exists(path):
            return None
        with open(path, "rb") as fh:
            data = fh.read()
        content_type = ""
        if os.path.exists(path + ".ct"):
            with open(path + ".ct", "r", encoding="utf-8") as fh:
                content_type = fh.read()
        return data, content_type

    def delete(self, key: str) -> bool:
        path = self._path(key)
        if not os.path.exists(path):
            return False
        os.remove(path)
        if os.path.exists(path + ".ct"):
            os.remove(path + ".ct")
        return True


class RepositoryDocumentStore:
    """Durable store backed by a :class:`~jobsearch.store.Repository` of
    :class:`~jobsearch.models.StoredDocument`. On a SQL backend the file bytes
    persist in Postgres (base64 in the JSON ``data`` column), so uploads survive
    restarts even where the container disk is ephemeral."""

    def __init__(self, repo: "Repository[StoredDocument]") -> None:
        self._repo = repo

    def put(self, key: str, data: bytes, *, content_type: str = "") -> str:
        from jobsearch.models import StoredDocument

        self._repo.add(
            StoredDocument(
                id=key,
                content_type=content_type or "",
                data_b64=base64.b64encode(data).decode("ascii"),
            )
        )
        return f"db://documents/{key}"

    def get(self, key: str) -> Optional[tuple[bytes, str]]:
        doc = self._repo.get(key)
        if doc is None:
            return None
        return base64.b64decode(doc.data_b64), doc.content_type

    def delete(self, key: str) -> bool:
        return self._repo.delete(key)


def build_document_store(
    settings: Optional[Settings] = None,
    repo: "Optional[Repository[StoredDocument]]" = None,
) -> DocumentStore:
    """Choose the most durable store available: a repository (Postgres) when one is
    given, else a filesystem store when ``document_dir`` is set, else in-memory."""
    if repo is not None:
        return RepositoryDocumentStore(repo)
    s = settings or get_settings()
    if s.document_dir:
        return LocalDocumentStore(s.document_dir)
    return InMemoryDocumentStore()
