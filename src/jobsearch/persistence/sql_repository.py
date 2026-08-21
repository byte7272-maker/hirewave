"""A generic SQL repository satisfying the :class:`jobsearch.store.Repository` port."""

from __future__ import annotations

from enum import Enum
from typing import Generic, Iterable, Optional, TypeVar

from sqlalchemy import Engine, and_, delete, insert, select, update

from jobsearch.persistence.tables import TableSpec

T = TypeVar("T")


def _normalize(value: object) -> Optional[str]:
    """Coerce an id/enum/scalar into the string stored in a promoted column."""
    if value is None:
        return None
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


class SqlRepository(Generic[T]):
    """CRUD over one entity table, reconstructing domain models from JSON.

    Implements the same surface as ``InMemoryRepository`` (``add``/``get``/
    ``all``/``find``/``delete``/``extend``). ``find`` only accepts keys that are
    promoted, indexed columns — querying an unindexed field raises, which keeps
    the query surface honest (add an index in ``tables.py`` if you need one).
    """

    def __init__(self, engine: Engine, spec: TableSpec) -> None:
        self._engine = engine
        self._spec = spec
        self._table = spec.table
        self._model = spec.model
        self._id = spec.id_attr
        self._columns = {spec.id_attr, *spec.indexed}

    # -- serialization ------------------------------------------------------
    def _row(self, item: T) -> dict:
        row: dict[str, object] = {"data": item.model_dump(mode="json")}  # type: ignore[attr-defined]
        for col in self._columns:
            row[col] = _normalize(getattr(item, col))
        return row

    def _load(self, data: dict) -> T:
        return self._model.model_validate(data)  # type: ignore[return-value]

    # -- Repository port ----------------------------------------------------
    def add(self, item: T) -> T:
        row = self._row(item)
        pk = row[self._id]
        set_values = {k: v for k, v in row.items() if k != self._id}
        with self._engine.begin() as conn:
            res = conn.execute(
                update(self._table).where(self._table.c[self._id] == pk).values(**set_values)
            )
            if res.rowcount == 0:
                conn.execute(insert(self._table).values(**row))
        return item

    def get(self, item_id: str) -> Optional[T]:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(self._table.c.data).where(self._table.c[self._id] == item_id)
            ).first()
        return self._load(row[0]) if row else None

    def all(self) -> list[T]:
        with self._engine.connect() as conn:
            rows = conn.execute(select(self._table.c.data)).all()
        return [self._load(r[0]) for r in rows]

    def find(self, **equals: object) -> list[T]:
        unknown = set(equals) - self._columns
        if unknown:
            raise ValueError(
                f"{self._table.name}: cannot query unindexed field(s) {sorted(unknown)}; "
                f"indexed columns are {sorted(self._columns)}"
            )
        conds = [self._table.c[k] == _normalize(v) for k, v in equals.items()]
        stmt = select(self._table.c.data)
        if conds:
            stmt = stmt.where(and_(*conds))
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return [self._load(r[0]) for r in rows]

    def delete(self, item_id: str) -> bool:
        with self._engine.begin() as conn:
            res = conn.execute(delete(self._table).where(self._table.c[self._id] == item_id))
        return res.rowcount > 0

    def extend(self, items: Iterable[T]) -> None:
        for item in items:
            self.add(item)
