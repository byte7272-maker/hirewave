"""JobAggregator — the agent that turns a search into ranked, verified matches.

Fans out across the configured job sources, normalizes every posting into the
platform's ``JobPosting`` shape, runs the existing fraud filter, and ingests new
ones. De-duplication is deliberately conservative:

* **Same-board re-post** (same source + external id, or same source + role/company/
  location) → collapsed, bumping the sighting count. A true duplicate.
* **Cross-board same job** (same company + position on a *different* board) → BOTH
  are kept and linked via a shared ``duplicate_group_id`` (+ ``cross_posting_ids``),
  so the user sees each source with a "likely the same job" indicator.
* **Obvious identical re-post** (same company + position AND near-identical
  description language) → consolidated into the first posting, tracked by
  ``consolidated_count`` / ``consolidated_sources``. Only this case is merged away.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from jobsearch.models.common import new_id

from jobsearch.engines.sourcing.skills import (
    CATEGORY_VERSION,
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
    job_ids: list[str] = field(default_factory=list)  # newly-ingested only
    #: Every job this search surfaced — newly ingested AND already-present dupes —
    #: so callers can show the search's real results (not just net-new).
    matched_job_ids: list[str] = field(default_factory=list)


def _norm_key(job: JobPosting) -> str:
    parts = f"{job.title} {job.company} {job.location}".lower()
    return re.sub(r"\s+", " ", parts).strip()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _group_key(job: JobPosting) -> str:
    """Key for "likely the same job across boards": company + position. Empty when
    the company is unknown (so we never group unrelated postings by title alone)."""
    company = _norm(job.company)
    title = _norm(job.title)
    return f"{company}|{title}" if company and title else ""


_WORD_RE = re.compile(r"[a-z0-9]{3,}")


def _same_language(a: JobPosting, b: JobPosting, *, threshold: float = 0.82) -> bool:
    """True when two postings' descriptions are near-identical (the "same language"
    signal) — a strong indication one is a straight re-post of the other. Word-set
    Jaccard; both descriptions must be non-trivial."""
    wa = set(_WORD_RE.findall((a.description or "").lower()))
    wb = set(_WORD_RE.findall((b.description or "").lower()))
    if len(wa) < 15 or len(wb) < 15:  # too little text to judge confidently
        return False
    inter = len(wa & wb)
    union = len(wa | wb)
    return union > 0 and inter / union >= threshold


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
            category_version=CATEGORY_VERSION,
            seniority=str(raw.get("seniority") or detect_seniority(blob)),
            employment_type=str(raw.get("employment_type") or detect_employment_type(blob)),
            years_experience=raw.get("years_experience") if raw.get("years_experience") is not None
            else detect_years_experience(blob),
            benefits=list(raw.get("benefits") or []) or detect_benefits(blob),
            url=str(raw.get("url", "")),
            company_logo_url=str(
                raw.get("company_logo_url") or raw.get("company_logo") or raw.get("logo") or ""
            ),
            application_email=str(raw.get("application_email", "")),
        )

    def ingest(self, raw: list[dict], *, sources: Optional[set[str]] = None) -> AggregationResult:
        """Normalize → dedupe → verify → store a batch of raw postings (shared by
        the multi-site search and the email-alert import). See the module docstring
        for the same-board / cross-board / identical-re-post policy."""
        used = sources or {str(r.get("source_platform") or "unknown") for r in raw}

        # Within-batch, collapse only *same-source* exact dupes (a board returning a
        # posting twice). Cross-source same-job postings are kept and linked below.
        batch: dict[tuple, JobPosting] = {}
        for r in raw:
            job = self._to_job(r)
            skey = (job.source_platform, job.external_id or _norm_key(job))
            batch.setdefault(skey, job)

        # Index what's already stored: same-source dup lookup + cross-board groups.
        stored = self.jobs.all()
        by_src_key: dict[tuple, JobPosting] = {}
        by_ext: dict[tuple, JobPosting] = {}
        groups: dict[str, list[JobPosting]] = {}
        for j in stored:
            by_src_key[(j.source_platform, _norm_key(j))] = j
            if j.external_id:
                by_ext[(j.source_platform, j.external_id)] = j
            gk = _group_key(j)
            if gk:
                groups.setdefault(gk, []).append(j)

        result = AggregationResult(found=len(raw), sources=sorted(used))
        for job in batch.values():
            # 1) Same-board re-post → collapse (bump the sighting count).
            same_board = (
                by_ext.get((job.source_platform, job.external_id)) if job.external_id else None
            ) or by_src_key.get((job.source_platform, _norm_key(job)))
            if same_board is not None:
                same_board.times_seen += 1
                same_board.last_seen_at = utcnow()
                self.jobs.add(same_board)
                result.duplicates += 1
                result.matched_job_ids.append(same_board.id)
                continue

            gk = _group_key(job)
            group = groups.get(gk, []) if gk else []

            # 2) Obvious identical re-post on another board → consolidate into the
            # first same-language posting (do not store a second row).
            twin = next((g for g in group if _same_language(job, g)), None)
            if twin is not None:
                twin.consolidated_count += 1
                if job.source_platform and job.source_platform not in twin.consolidated_sources:
                    twin.consolidated_sources.append(job.source_platform)
                twin.times_seen += 1
                twin.last_seen_at = utcnow()
                self.jobs.add(twin)
                result.duplicates += 1
                result.matched_job_ids.append(twin.id)
                continue

            # 3) Same company + position but different wording → KEEP it, and link it
            # to the rest of the group as "likely the same job" (a shared group id).
            if group:
                gid = next((g.duplicate_group_id for g in group if g.duplicate_group_id), "") \
                    or new_id("grp_")
                job.duplicate_group_id = gid
                for g in group:
                    if g.duplicate_group_id != gid or job.id not in g.cross_posting_ids:
                        g.duplicate_group_id = gid
                        if job.id not in g.cross_posting_ids:
                            g.cross_posting_ids.append(job.id)
                        self.jobs.add(g)
                    if g.id not in job.cross_posting_ids:
                        job.cross_posting_ids.append(g.id)

            self.jobs.add(job)
            v: VerificationResult = self.verification.verify(job)
            self.verifications[job.id] = v
            if v.display_action == "hidden":
                result.hidden += 1
            result.ingested += 1
            result.job_ids.append(job.id)
            result.matched_job_ids.append(job.id)
            # so later batch items link/consolidate against this one too
            by_src_key[(job.source_platform, _norm_key(job))] = job
            if gk:
                groups.setdefault(gk, []).append(job)
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
