"""VerificationEngine — combine signals into an authenticity score.

Score starts at 100 and each fired signal subtracts its penalty (floored at 0).
The resulting :class:`VerificationResult` carries the score, the flags, and
per-signal detail, and its ``display_action`` maps to the section 6.4 policy:

    0-39  -> hidden (opt-in only)
    40-69 -> shown with warning banner
    70-100 -> shown normally
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from jobsearch.engines.verification import signals as sig
from jobsearch.models import JobPosting, VerificationResult
from jobsearch.models.job import VerificationFlag


@dataclass
class VerificationContext:
    """External facts the pure signals cannot derive from the posting alone."""

    #: Age of the company domain in days, if resolvable (None = unknown).
    domain_age_days: Optional[int] = None
    #: How many postings this source/company published in the recent window.
    source_posting_count: int = 0
    #: Threshold above which posting velocity is suspicious.
    velocity_threshold: int = 50
    #: Known-bad domains / company names (lowercased).
    scam_domains: frozenset[str] = field(default_factory=frozenset)
    scam_companies: frozenset[str] = field(default_factory=frozenset)


# Signals that depend only on the posting text/fields.
_PURE_SIGNALS: list[Callable[[JobPosting], Optional[sig.SignalHit]]] = [
    sig.urgency_signal,
    sig.excessive_promises_signal,
    sig.off_platform_contact_signal,
    sig.vague_requirements_signal,
    sig.salary_plausibility_signal,
]


class VerificationEngine:
    def __init__(self, *, young_domain_days: int = 90) -> None:
        self.young_domain_days = young_domain_days

    def verify(
        self, job: JobPosting, *, context: Optional[VerificationContext] = None
    ) -> VerificationResult:
        ctx = context or VerificationContext()
        hits: list[sig.SignalHit] = []

        for signal in _PURE_SIGNALS:
            hit = signal(job)
            if hit is not None:
                hits.append(hit)

        hits.extend(self._context_signals(job, ctx))

        score = 100
        flags: list[VerificationFlag] = []
        details: dict[str, str] = {}
        for hit in hits:
            score -= hit.penalty
            if hit.flag not in flags:
                flags.append(hit.flag)
            details[hit.flag.value] = hit.detail

        score = max(0, min(100, score))
        result = VerificationResult(
            job_posting_id=job.id,
            authenticity_score=score,
            flags=flags,
            details={"signals": details, "penalty_total": 100 - score},
        )
        job.is_verified = result.authenticity_score >= 70
        return result

    def _context_signals(
        self, job: JobPosting, ctx: VerificationContext
    ) -> list[sig.SignalHit]:
        out: list[sig.SignalHit] = []

        domain = job.company_domain.lower().strip()
        company = job.company.lower().strip()

        if domain and domain in ctx.scam_domains:
            out.append(
                sig.SignalHit(
                    VerificationFlag.KNOWN_SCAM_SOURCE,
                    penalty=100,
                    detail=f"Domain {domain} is on the known-scam list",
                )
            )
        elif company and company in ctx.scam_companies:
            out.append(
                sig.SignalHit(
                    VerificationFlag.KNOWN_SCAM_SOURCE,
                    penalty=100,
                    detail=f"Company '{job.company}' is on the known-scam list",
                )
            )

        if ctx.domain_age_days is not None and ctx.domain_age_days < self.young_domain_days:
            out.append(
                sig.SignalHit(
                    VerificationFlag.YOUNG_DOMAIN,
                    penalty=20,
                    detail=f"Company domain is only {ctx.domain_age_days} days old",
                )
            )
        elif domain == "" and job.source_platform not in {"linkedin", "indeed", "greenhouse"}:
            out.append(
                sig.SignalHit(
                    VerificationFlag.UNVERIFIED_COMPANY,
                    penalty=10,
                    detail="No verifiable company domain on the posting",
                )
            )

        if ctx.source_posting_count > ctx.velocity_threshold:
            out.append(
                sig.SignalHit(
                    VerificationFlag.HIGH_POSTING_VELOCITY,
                    penalty=15,
                    detail=(
                        f"Source posted {ctx.source_posting_count} roles recently "
                        f"(> {ctx.velocity_threshold})"
                    ),
                )
            )
        return out
