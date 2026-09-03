"""JobAggregator — the agent that turns a search into ranked, verified matches.

Fans out across the configured job sources, normalizes every posting into the
platform's ``JobPosting`` shape, collapses cross-board duplicates, runs the
existing fraud filter, and ingests the new ones. Existing postings (same
external id or same role+company already stored) are skipped so repeated
searches don't pile up dupes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from jobsearch.engines.sourcing.skills import enrich_requirements
from jobsearch.engines.sourcing.sources import JobQuery, JobSource
from jobsearch.models import JobPosting, VerificationResult
from jobsearch.models.job import SalaryRange


def _parse_dt(value) -> Optional[datetime]:
    """Parse a posted-at value (ISO string or datetime); None when absent/bad."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


@dataclass
class AggregationResult:
    found: int = 0  # total raw postings pulled across sources
    ingested: int = 0  # newly stored postings
    duplicates: int = 0  # skipped as dup of a batch/stored posting
    hidden: int = 0  # ingested but auto-hidden by the fraud filter
    sources: list[str] = field(default_factory=list)
    job_ids: list[str] = field(default_factory=list)


def _norm_key(job: JobPosting) -> str:
    parts = f"{job.title} {job.company} {job.location}".lower()
    return re.sub(r"\s+", " ", parts).strip()


class JobAggregator:
    def __init__(self, sources, jobs_repo, verification, verifications: dict) -> None:
        self.sources = sources
        self.jobs = jobs_repo
        self.verification = verification
        self.verifications = verifications

    @staticmethod
    def _to_job(raw: dict) -> JobPosting:
        sr = raw.get("salary_range")
        salary = SalaryRange(**sr) if isinstance(sr, dict) and sr else None
        title = str(raw.get("title", ""))
        description = str(raw.get("description", ""))
        # Enrich sparse/generic requirements with concrete skills mined from the
        # title + description, so matching / résumé-review / interview prep have
        # real signal to work with.
        requirements = enrich_requirements(
            list(raw.get("requirements") or []), f"{title}\n{description}"
        )
        return JobPosting(
            source_platform=str(raw.get("source_platform", "")),
            external_id=str(raw.get("external_id", "")),
            title=title,
            company=str(raw.get("company", "")),
            company_domain=str(raw.get("company_domain", "")),
            location=str(raw.get("location", "")),
            remote=bool(raw.get("remote", False)),
            description=description,
            requirements=requirements,
            salary_range=salary,
            posted_at=_parse_dt(raw.get("posted_at")),
            url=str(raw.get("url", "")),
            application_email=str(raw.get("application_email", "")),
        )

    def ingest(self, raw: list[dict], *, sources: Optional[set[str]] = None) -> AggregationResult:
        """Normalize → dedupe → verify → store a batch of raw postings (shared by
        the multi-site search and the email-alert import)."""
        used = sources or {str(r.get("source_platform") or "unknown") for r in raw}

        # Collapse duplicates *within* this batch (same role+company+location).
        batch: dict[str, JobPosting] = {}
        for r in raw:
            job = self._to_job(r)
            batch.setdefault(_norm_key(job), job)

        # Skip anything already stored (by external id, or same normalized role).
        existing_keys = {_norm_key(j) for j in self.jobs.all()}
        existing_ext = {(j.source_platform, j.external_id) for j in self.jobs.all() if j.external_id}

        result = AggregationResult(found=len(raw), sources=sorted(used))
        for key, job in batch.items():
            if key in existing_keys or (job.external_id and (job.source_platform, job.external_id) in existing_ext):
                result.duplicates += 1
                continue
            self.jobs.add(job)
            v: VerificationResult = self.verification.verify(job)
            self.verifications[job.id] = v
            if v.display_action == "hidden":
                result.hidden += 1
            result.ingested += 1
            result.job_ids.append(job.id)
            existing_keys.add(key)
        return result

    def search(self, query: JobQuery, *, sources_filter: Optional[set[str]] = None) -> AggregationResult:
        raw: list[dict] = []
        used: set[str] = set()
        for src in self.sources:
            if sources_filter and src.name not in sources_filter:
                continue
            for r in src.search(query):
                raw.append(r)
                used.add(str(r.get("source_platform") or src.name))
        return self.ingest(raw, sources=used)
