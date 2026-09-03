"""Job sources — the adapters the agent queries to ingest postings.

A ``JobSource`` turns a user's search (role / location / remote) into raw
postings (``JobInput``-shaped dicts). The offline ``MockJobSource`` returns
deterministic, multi-board results — including a duplicate (to exercise dedupe)
and a scam (to exercise the fraud filter) — so the whole aggregation and
saved-search flow is testable with no external API. ``HttpAggregatorJobSource``
queries a licensed job-search aggregator you point at (one key, many boards);
real sources are user-directed and stay within each board's ToS.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, Protocol, runtime_checkable

from jobsearch.models.common import utcnow

from jobsearch.config import Settings, get_settings


@dataclass
class JobQuery:
    role: str
    location: str = ""
    remote: Optional[bool] = None
    limit: int = 25


@runtime_checkable
class JobSource(Protocol):
    @property
    def name(self) -> str: ...

    def search(self, query: JobQuery) -> list[dict]: ...


# --- offline mock -----------------------------------------------------------
_COMPANIES = [
    ("Northwind Labs", "northwind.io"), ("Globex", "globex.com"),
    ("Umbrella Software", "umbrella.dev"), ("Initech", "initech.com"),
    ("Hooli", "hooli.com"), ("Stark Industries", "stark.com"),
]
_BOARDS = ["indeed", "monster", "glassdoor", "linkedin"]
_PREFIXES = ["Senior", "", "Staff", "Lead", "Principal"]


def _pick(seed: str, pool: list):
    return pool[int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(pool)]


class MockJobSource:
    """Deterministic, board-tagged postings derived from the query."""

    name = "mock"

    def search(self, query: JobQuery) -> list[dict]:
        role = (query.role or "Engineer").strip()
        loc = query.location.strip() or "Remote"
        remote = True if query.remote is None else query.remote
        out: list[dict] = []
        n = max(1, min(query.limit, 6))
        for i in range(n):
            prefix = _PREFIXES[i % len(_PREFIXES)]
            title = f"{prefix} {role}".strip()
            company, domain = _pick(f"{role}|{i}", _COMPANIES)
            board = _BOARDS[i % len(_BOARDS)]
            base = 90000 + (i * 15000)
            out.append({
                "source_platform": board,
                "external_id": f"{board}-{hashlib.md5(f'{role}|{i}'.encode()).hexdigest()[:8]}",
                "title": title,
                "company": company,
                "company_domain": domain,
                "location": loc,
                "remote": remote,
                "description": (
                    f"{title} at {company}. Own core product work and collaborate across "
                    f"teams. Build and scale services in Python and AWS, with Docker and "
                    f"Kubernetes; strong SQL and REST API design. Agile environment."
                ),
                "requirements": [role, "Collaboration", "Communication"],
                "salary_range": {"currency": "USD", "minimum": base, "maximum": base + 40000},
                "posted_at": (utcnow() - timedelta(days=i * 4 + 1)).isoformat(),
                "url": f"https://{board}.com/jobs/{company.lower().replace(' ', '-')}-{i}",
            })
        # A cross-board DUPLICATE of the first role (same title+company, other board).
        if out:
            dup = dict(out[0])
            other = "glassdoor" if dup["source_platform"] != "glassdoor" else "monster"
            dup["source_platform"] = other
            dup["external_id"] = f"{other}-dup"
            dup["url"] = f"https://{other}.com/jobs/dup"
            out.append(dup)
        # A SCAM posting (trips urgency + unrealistic-promise + off-platform-contact).
        out.append({
            "source_platform": "aggregator",
            "external_id": "scam-1",
            "title": f"{role} — Work From Home",
            "company": "QuickCash Global",
            "company_domain": "",
            "location": loc,
            "remote": True,
            "description": (
                "URGENT hiring! Earn $5,000/week working from home, guaranteed income! "
                "No experience needed. Send your resume to quickcash-hr@gmail.com today."
            ),
            "requirements": [],
            "url": "https://bit.ly/qc-job",
        })
        return out


class HttpAggregatorJobSource:
    """Generic licensed-aggregator search over a user-directed HTTP endpoint.

    Expects ``GET {url}?role=&location=&remote=&limit=`` returning either a list
    of postings or ``{"results": [...]}``; each posting is normalized to the
    ``JobInput`` shape. Never raises into the agent — a failure yields no results.
    """

    name = "aggregator"

    def __init__(self, url: str, *, api_key: str = "", timeout: float = 20.0) -> None:
        self._url = url
        self._api_key = api_key
        self._timeout = timeout

    def search(self, query: JobQuery) -> list[dict]:  # pragma: no cover - network
        import httpx

        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        params = {"role": query.role, "location": query.location, "limit": query.limit}
        if query.remote is not None:
            params["remote"] = str(query.remote).lower()
        try:
            resp = httpx.get(self._url, headers=headers, params=params, timeout=self._timeout)
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError):
            return []
        rows = data.get("results", data) if isinstance(data, dict) else data
        return [self._normalize(r) for r in rows if isinstance(r, dict)]

    @staticmethod
    def _normalize(r: dict) -> dict:  # pragma: no cover - network
        sr = r.get("salary_range") or r.get("salary") or {}
        return {
            "source_platform": str(r.get("source_platform") or r.get("board") or "aggregator"),
            "external_id": str(r.get("external_id") or r.get("id") or ""),
            "title": str(r.get("title", "")),
            "company": str(r.get("company", "")),
            "company_domain": str(r.get("company_domain", "")),
            "location": str(r.get("location", "")),
            "remote": bool(r.get("remote", False)),
            "description": str(r.get("description", "")),
            "requirements": list(r.get("requirements") or []),
            "salary_range": sr if isinstance(sr, dict) and sr else None,
            "url": str(r.get("url", "")),
        }


def build_job_sources(settings: Optional[Settings] = None) -> list[JobSource]:
    s = settings or get_settings()
    if s.job_source_provider == "http" and s.job_source_url:
        return [HttpAggregatorJobSource(s.job_source_url, api_key=s.job_source_api_key, timeout=s.job_source_timeout_seconds)]
    return [MockJobSource()]
