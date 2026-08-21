"""Document object storage — where uploaded résumé files live.

A small port (the plan's "S3-compatible object storage" tier) with two
implementations: an in-memory store (default; great for tests and single-process
runs) and a local-filesystem store (durable; set ``JOBSEARCH_DOCUMENT_DIR``, back
it with a volume/S3 in production). Files are keyed by résumé id.
"""

from __future__ import annotations

import os
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


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


def build_document_store(settings: Optional[Settings] = None) -> DocumentStore:
    """Filesystem store when ``document_dir`` is set, else in-memory."""
    s = settings or get_settings()
    if s.document_dir:
        return LocalDocumentStore(s.document_dir)
    return InMemoryDocumentStore()
