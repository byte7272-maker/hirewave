"""Individual authenticity signals.

Each signal inspects a posting (plus optional external context) and, if it
fires, returns a :class:`SignalHit` carrying the flag, a penalty applied to the
100-point authenticity score, and human-readable detail. The engine sums the
penalties. Signals that need external data (domain age, scam databases) receive
it via the context so this module stays pure and testable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from jobsearch.models import JobPosting
from jobsearch.models.job import VerificationFlag

_URGENCY_PATTERNS = [
    r"\burgent(ly)?\b",
    r"\bimmediate (start|hire|joining)\b",
    r"\bhiring (now|immediately)\b",
    r"\bapply (now|today|asap)\b",
    r"\blimited (spots|positions|time)\b",
    r"\bstart tomorrow\b",
]
_PROMISE_PATTERNS = [
    r"\bunlimited (income|earning|earnings)\b",
    r"\bguaranteed (income|job|money|salary)\b",
    r"\bno experience (necessary|needed|required)\b",
    r"\bearn \$?\d{3,}(k|,\d{3})? (a|per) (day|week)\b",
    r"\bwork from home and earn\b",
    r"\bbe your own boss\b",
    r"\bget rich\b",
]
_OFF_PLATFORM_PATTERNS = [
    r"\b(whats ?app|telegram|signal)\b",
    r"\btext (me|us) (at|on)\b",
    r"\bcontact .{0,20}@(gmail|yahoo|hotmail|outlook)\.",
    r"\bsend .{0,20}(resume|cv) to .{0,30}@(gmail|yahoo|hotmail|outlook)\.",
]


@dataclass
class SignalHit:
    flag: VerificationFlag
    penalty: int  # points subtracted from 100
    detail: str


def _count_matches(patterns: list[str], text: str) -> int:
    return sum(1 for p in patterns if re.search(p, text, re.IGNORECASE))


def urgency_signal(job: JobPosting) -> Optional[SignalHit]:
    hits = _count_matches(_URGENCY_PATTERNS, job.description)
    if hits >= 2:
        return SignalHit(
            VerificationFlag.URGENCY_LANGUAGE,
            penalty=min(25, 8 * hits),
            detail=f"{hits} urgency phrases detected",
        )
    return None


def excessive_promises_signal(job: JobPosting) -> Optional[SignalHit]:
    hits = _count_matches(_PROMISE_PATTERNS, job.description)
    if hits >= 1:
        return SignalHit(
            VerificationFlag.EXCESSIVE_PROMISES,
            penalty=min(35, 18 * hits),
            detail=f"{hits} unrealistic-promise phrases detected",
        )
    return None


def off_platform_contact_signal(job: JobPosting) -> Optional[SignalHit]:
    if _count_matches(_OFF_PLATFORM_PATTERNS, job.description) >= 1:
        return SignalHit(
            VerificationFlag.CONTACT_OFF_PLATFORM,
            penalty=30,
            detail="Posting pushes contact to personal email / messaging apps",
        )
    return None


def vague_requirements_signal(job: JobPosting) -> Optional[SignalHit]:
    desc = job.description.strip()
    words = len(desc.split())
    has_reqs = bool(job.requirements) or bool(re.search(r"require|responsib|qualif", desc, re.I))
    if words < 40 and not has_reqs:
        return SignalHit(
            VerificationFlag.VAGUE_REQUIREMENTS,
            penalty=15,
            detail=f"Very short description ({words} words) with no stated requirements",
        )
    return None


def salary_plausibility_signal(job: JobPosting) -> Optional[SignalHit]:
    sr = job.salary_range
    if not sr or sr.maximum is None:
        return None
    # Flag implausibly high advertised pay (a common scam lure). Assume annual.
    if sr.maximum >= 600_000:
        return SignalHit(
            VerificationFlag.IMPLAUSIBLE_SALARY,
            penalty=20,
            detail=f"Advertised salary max {sr.currency} {sr.maximum:,} is implausibly high",
        )
    # Flag a nonsensical band where min exceeds max.
    if sr.minimum is not None and sr.minimum > sr.maximum:
        return SignalHit(
            VerificationFlag.IMPLAUSIBLE_SALARY,
            penalty=10,
            detail="Salary minimum exceeds maximum",
        )
    return None
