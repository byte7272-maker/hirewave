"""In-memory repositories + an encrypted token store.

These are deliberately simple reference implementations of the persistence
*ports* the engines expect. A production web layer swaps them for
PostgreSQL/MongoDB/Redis-backed repositories exposing the same methods — the
engines never import a database driver.
"""

from __future__ import annotations

from typing import Generic, Iterable, Optional, Protocol, TypeVar, runtime_checkable

from jobsearch.models import BrowserSession, OAuthToken, Provider
from jobsearch.models.common import utcnow
from jobsearch.security.crypto import FieldCipher

T = TypeVar("T")


@runtime_checkable
class Repository(Protocol[T]):
    """The persistence port the engines and API depend on.

    Both :class:`InMemoryRepository` and the SQL-backed repository in
    :mod:`jobsearch.persistence` satisfy this — swapping one for the other
    requires no changes in callers.
    """

    def add(self, item: T) -> T: ...
    def get(self, item_id: str) -> Optional[T]: ...
    def all(self) -> list[T]: ...
    def find(self, **equals: object) -> list[T]: ...
    def delete(self, item_id: str) -> bool: ...
    def extend(self, items: Iterable[T]) -> None: ...


class InMemoryRepository(Generic[T]):
    """A minimal id-keyed collection with predicate queries."""

    def __init__(self, id_attr: str = "id") -> None:
        self._items: dict[str, T] = {}
        self._id_attr = id_attr

    def add(self, item: T) -> T:
        self._items[getattr(item, self._id_attr)] = item
        return item

    def get(self, item_id: str) -> Optional[T]:
        return self._items.get(item_id)

    def all(self) -> list[T]:
        return list(self._items.values())

    def find(self, **equals: object) -> list[T]:
        def matches(obj: T) -> bool:
            return all(getattr(obj, k, None) == v for k, v in equals.items())

        return [obj for obj in self._items.values() if matches(obj)]

    def delete(self, item_id: str) -> bool:
        return self._items.pop(item_id, None) is not None

    def extend(self, items: Iterable[T]) -> None:
        for item in items:
            self.add(item)


class TokenStore:
    """Stores :class:`OAuthToken` with access/refresh tokens encrypted at rest.

    The plaintext never touches the repository — :meth:`save` encrypts before
    storing and :meth:`reveal` decrypts on read. Ciphertext is bound (via AAD)
    to ``user_id:provider`` so a blob cannot be replayed onto another record.
    """

    def __init__(
        self,
        cipher: Optional[FieldCipher] = None,
        *,
        repo: Optional["Repository[OAuthToken]"] = None,
    ) -> None:
        self._cipher = cipher or FieldCipher()
        self._repo: Repository[OAuthToken] = repo or InMemoryRepository()

    @staticmethod
    def _aad(user_id: str, provider: Provider | str) -> str:
        p = provider.value if isinstance(provider, Provider) else provider
        return f"{user_id}:{p}"

    def save(
        self,
        *,
        user_id: str,
        provider: Provider,
        access_token: str,
        refresh_token: str = "",
        scopes: Optional[list[str]] = None,
        expires_at=None,
    ) -> OAuthToken:
        aad = self._aad(user_id, provider)
        existing = self.get_record(user_id, provider)
        token = existing or OAuthToken(user_id=user_id, provider=provider)
        token.access_token = self._cipher.encrypt(access_token, aad=aad)
        token.refresh_token = (
            self._cipher.encrypt(refresh_token, aad=aad) if refresh_token else ""
        )
        token.scopes = scopes or token.scopes
        token.expires_at = expires_at
        token.updated_at = utcnow()
        return self._repo.add(token)

    def get_record(self, user_id: str, provider: Provider) -> Optional[OAuthToken]:
        matches = self._repo.find(user_id=user_id, provider=provider)
        return matches[0] if matches else None

    def reveal(self, user_id: str, provider: Provider) -> Optional[tuple[str, str]]:
        """Return decrypted ``(access_token, refresh_token)`` or ``None``."""
        rec = self.get_record(user_id, provider)
        if rec is None:
            return None
        aad = self._aad(user_id, provider)
        access = self._cipher.decrypt(rec.access_token, aad=aad) if rec.access_token else ""
        refresh = self._cipher.decrypt(rec.refresh_token, aad=aad) if rec.refresh_token else ""
        return access, refresh

    def list_providers(self, user_id: str) -> list[OAuthToken]:
        return self._repo.find(user_id=user_id)

    def delete(self, user_id: str, provider: Provider) -> bool:
        rec = self.get_record(user_id, provider)
        return self._repo.delete(rec.id) if rec else False


class SessionStore:
    """Stores a :class:`BrowserSession`'s ``storage_state`` (provider cookies)
    encrypted at rest, exactly like :class:`TokenStore` does for OAuth tokens.

    The plaintext session JSON never touches the repository; ciphertext is bound
    (AAD) to ``user_id:provider`` so a blob can't be replayed onto another
    record. We store the *session*, never the password — the user establishes it
    themselves via the local ``jobsearch.connect`` helper.
    """

    def __init__(
        self,
        cipher: Optional[FieldCipher] = None,
        *,
        repo: Optional["Repository[BrowserSession]"] = None,
    ) -> None:
        self._cipher = cipher or FieldCipher()
        self._repo: Repository[BrowserSession] = repo or InMemoryRepository()

    @staticmethod
    def _aad(user_id: str, provider: str) -> str:
        return f"{user_id}:{provider}"

    def save(
        self,
        *,
        user_id: str,
        provider: str,
        storage_state: str,
        label: str = "",
        expires_at=None,
    ) -> BrowserSession:
        aad = self._aad(user_id, provider)
        sess = self.get_record(user_id, provider) or BrowserSession(user_id=user_id, provider=provider)
        sess.storage_state = self._cipher.encrypt(storage_state, aad=aad)
        sess.label = label or sess.label
        sess.status = "active"
        sess.expires_at = expires_at
        sess.updated_at = utcnow()
        return self._repo.add(sess)

    def get_record(self, user_id: str, provider: str) -> Optional[BrowserSession]:
        matches = self._repo.find(user_id=user_id, provider=provider)
        return matches[0] if matches else None

    def reveal(self, user_id: str, provider: str) -> Optional[str]:
        """Return the decrypted ``storage_state`` JSON, or ``None`` if no active
        session exists."""
        rec = self.get_record(user_id, provider)
        if rec is None or rec.status != "active" or not rec.storage_state:
            return None
        return self._cipher.decrypt(rec.storage_state, aad=self._aad(user_id, provider))

    def mark_used(self, user_id: str, provider: str) -> None:
        rec = self.get_record(user_id, provider)
        if rec is not None:
            rec.last_used_at = utcnow()
            self._repo.add(rec)

    def mark_status(self, user_id: str, provider: str, status: str) -> Optional[BrowserSession]:
        rec = self.get_record(user_id, provider)
        if rec is None:
            return None
        rec.status = status
        rec.updated_at = utcnow()
        return self._repo.add(rec)

    def list_for(self, user_id: str) -> list[BrowserSession]:
        return self._repo.find(user_id=user_id)

    def delete(self, user_id: str, provider: str) -> bool:
        rec = self.get_record(user_id, provider)
        return self._repo.delete(rec.id) if rec else False
