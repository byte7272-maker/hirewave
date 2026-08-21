"""JobAuthenticityEngine — the shared real/dubious/scam ledger.

One record per normalized job identity (company + title), shared across all
users. Community reports and automated signals (the fraud score + an
employer-site check) are fused into a single ``verdict`` everyone can see.
"""

from __future__ import annotations

import re
from typing import Optional

from jobsearch.engines.authenticity.employer import EmployerVerifier, MockEmployerVerifier
from jobsearch.models import (
    EmployerStatus,
    JobAuthenticityRecord,
    JobPosting,
    ReportVerdict,
    Verdict,
)
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository

_MAX_REASONS = 25


def norm_key(company: str, title: str) -> str:
    return re.sub(r"\s+", " ", f"{company}|{title}".lower()).strip()


class JobAuthenticityEngine:
    def __init__(
        self,
        repo: Optional[Repository[JobAuthenticityRecord]] = None,
        verifier: Optional[EmployerVerifier] = None,
    ) -> None:
        self.repo = repo or InMemoryRepository(id_attr="id")
        self.verifier = verifier or MockEmployerVerifier()

    # -- lookup / create ----------------------------------------------------
    def get_by_key(self, key: str) -> Optional[JobAuthenticityRecord]:
        found = self.repo.find(key=key)
        return found[0] if found else None

    def _get_or_create(self, company: str, title: str) -> JobAuthenticityRecord:
        key = norm_key(company, title)
        rec = self.get_by_key(key)
        if rec is None:
            rec = JobAuthenticityRecord(key=key, company=company, title=title)
        return rec

    # -- verdict fusion -----------------------------------------------------
    @staticmethod
    def _recompute(rec: JobAuthenticityRecord) -> None:
        t = rec.tally()
        scam, dub, legit = t["scam"], t["dubious"], t["legit"]
        emp = rec.employer_status
        score = rec.min_authenticity_score
        if (scam >= 3 and scam >= legit) or emp == EmployerStatus.INVALID_DOMAIN or score < 40:
            rec.verdict = Verdict.LIKELY_SCAM
        elif emp == EmployerStatus.NOT_FOUND or ((scam + dub) > legit and (scam + dub) >= 2):
            rec.verdict = Verdict.DUBIOUS
        elif emp == EmployerStatus.LISTED and legit >= 1:
            rec.verdict = Verdict.VERIFIED_REAL
        elif emp == EmployerStatus.LISTED or score >= 70:
            rec.verdict = Verdict.LIKELY_REAL
        else:
            rec.verdict = Verdict.UNVERIFIED
        rec.updated_at = utcnow()

    def _fold_score(self, rec: JobAuthenticityRecord, authenticity_score: Optional[int]) -> None:
        if authenticity_score is not None:
            rec.min_authenticity_score = min(rec.min_authenticity_score, int(authenticity_score))

    # -- mutations ----------------------------------------------------------
    def report(
        self,
        user_id: str,
        job: JobPosting,
        verdict: ReportVerdict,
        *,
        reason: str = "",
        authenticity_score: Optional[int] = None,
    ) -> JobAuthenticityRecord:
        rec = self._get_or_create(job.company, job.title)
        rec.votes[user_id] = verdict.value  # one vote per user; latest wins
        reason = reason.strip()
        if reason and reason not in rec.reasons:
            rec.reasons.insert(0, reason)
            del rec.reasons[_MAX_REASONS:]
        self._fold_score(rec, authenticity_score)
        self._recompute(rec)
        return self.repo.add(rec)

    def check_employer(
        self, job: JobPosting, *, authenticity_score: Optional[int] = None
    ) -> JobAuthenticityRecord:
        rec = self._get_or_create(job.company, job.title)
        status, detail = self.verifier.check(job)
        rec.employer_status = status
        rec.employer_detail = detail
        rec.last_checked_at = utcnow()
        self._fold_score(rec, authenticity_score)
        self._recompute(rec)
        return self.repo.add(rec)

    # -- read ---------------------------------------------------------------
    def snapshot(self, job: JobPosting, *, authenticity_score: Optional[int] = None) -> JobAuthenticityRecord:
        """A display record for a job — the stored ledger entry (if any) with
        the current fraud score folded in, computed fresh. Not persisted unless
        it already existed."""
        rec = self._get_or_create(job.company, job.title)
        self._fold_score(rec, authenticity_score)
        self._recompute(rec)
        return rec

    def flagged(self, limit: int = 50) -> list[JobAuthenticityRecord]:
        bad = {Verdict.DUBIOUS, Verdict.LIKELY_SCAM}
        recs = [r for r in self.repo.all() if r.verdict in bad]
        order = {Verdict.LIKELY_SCAM: 0, Verdict.DUBIOUS: 1}
        recs.sort(key=lambda r: (order.get(r.verdict, 2), -r.tally()["scam"], -r.tally()["dubious"]))
        return recs[: max(1, limit)]
