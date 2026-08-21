"""Shared job-authenticity ledger — community real/dubious/scam feedback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import AuthenticityOut, JobReportRequest
from jobsearch.models import JobAuthenticityRecord, JobPosting, ReportVerdict

router = APIRouter(prefix="/api/v1/authenticity", tags=["authenticity"])


def _out(rec: JobAuthenticityRecord, user_id: str) -> AuthenticityOut:
    return AuthenticityOut(
        key=rec.key,
        company=rec.company,
        title=rec.title,
        verdict=rec.verdict.value,
        employer_status=rec.employer_status.value,
        employer_detail=rec.employer_detail,
        min_authenticity_score=rec.min_authenticity_score,
        tally=rec.tally(),
        reasons=rec.reasons,
        your_vote=rec.votes.get(user_id),
        last_checked_at=rec.last_checked_at.isoformat() if rec.last_checked_at else None,
    )


def _job(job_id: str, state: StateDep) -> JobPosting:
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _score(job: JobPosting, state: StateDep) -> int:
    v = state.verifications.get(job.id) or state.verification.verify(job)
    state.verifications[job.id] = v
    return v.authenticity_score


@router.get("/job/{job_id}", response_model=AuthenticityOut)
def job_authenticity(job_id: str, user: CurrentUser, state: StateDep) -> AuthenticityOut:
    """The shared verdict for a job (community reports + automated signals)."""
    job = _job(job_id, state)
    rec = state.authenticity.snapshot(job, authenticity_score=_score(job, state))
    return _out(rec, user.id)


@router.post("/job/{job_id}/report", response_model=AuthenticityOut)
def report_job(job_id: str, body: JobReportRequest, user: CurrentUser, state: StateDep) -> AuthenticityOut:
    """Report a posting as legit / dubious / scam (one vote per user)."""
    job = _job(job_id, state)
    try:
        verdict = ReportVerdict(body.verdict)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown verdict '{body.verdict}'") from exc
    rec = state.authenticity.report(
        user.id, job, verdict, reason=body.reason, authenticity_score=_score(job, state)
    )
    return _out(rec, user.id)


@router.post("/job/{job_id}/verify-employer", response_model=AuthenticityOut)
def verify_employer(job_id: str, user: CurrentUser, state: StateDep) -> AuthenticityOut:
    """Check the employer's site to confirm the posting is really available."""
    job = _job(job_id, state)
    rec = state.authenticity.check_employer(job, authenticity_score=_score(job, state))
    return _out(rec, user.id)


@router.get("/flagged", response_model=list[AuthenticityOut])
def flagged(user: CurrentUser, state: StateDep, limit: int = Query(50, ge=1, le=200)) -> list[AuthenticityOut]:
    """The shared scam-watch list — postings the community flagged as dubious/scam."""
    return [_out(r, user.id) for r in state.authenticity.flagged(limit=limit)]
