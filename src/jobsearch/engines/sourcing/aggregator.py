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

from jobsearch.engines.sourcing.skills import (
    detect_benefits,
    detect_category,
    detect_employment_type,
    detect_seniority,
    detect_years_experience,
    enrich_requirements,
)
from jobsearch.engines.sourcing.sources import JobQuery, JobSource
from jobsearch.models import JobPosting, VerificationResult
from jobsearch.models.common import utcnow
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
        blob = f"{title}\n{description}"
        requirements = enrich_requirements(list(raw.get("requirements") or []), blob)
        # Structured metadata — prefer an explicit source value, else parse the text.
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
            category=str(raw.get("category") or detect_category(f"{title} {title} {description}")),
            seniority=str(raw.get("seniority") or detect_seniority(blob)),
            employment_type=str(raw.get("employment_type") or detect_employment_type(blob)),
            years_experience=raw.get("years_experience") if raw.get("years_experience") is not None
            else detect_years_experience(blob),
            benefits=list(raw.get("benefits") or []) or detect_benefits(blob),
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

        # Index what's already stored so a re-sighting can be counted (not just
        # skipped) — same external id, or same normalized role+company+location.
        stored = self.jobs.all()
        by_key = {_norm_key(j): j for j in stored}
        by_ext = {(j.source_platform, j.external_id): j for j in stored if j.external_id}

        result = AggregationResult(found=len(raw), sources=sorted(used))
        for key, job in batch.items():
            existing = by_key.get(key) or (
                by_ext.get((job.source_platform, job.external_id)) if job.external_id else None
            )
            if existing is not None:
                # Seen again — bump the sighting count + timestamp (re-posting signal).
                existing.times_seen += 1
                existing.last_seen_at = utcnow()
                self.jobs.add(existing)
                result.duplicates += 1
                continue
            self.jobs.add(job)
            v: VerificationResult = self.verification.verify(job)
            self.verifications[job.id] = v
            if v.display_action == "hidden":
                result.hidden += 1
            result.ingested += 1
            result.job_ids.append(job.id)
            by_key[key] = job  # so a later batch item can't re-add the same role
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
