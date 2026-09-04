"""§5.3 Job postings & matching."""

from __future__ import annotations

import csv
import io
import json
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import IngestRequest, MatchOut, ReorderSavedRequest, SaveJobRequest
from jobsearch.models import JobPosting, SavedJob, UserProfile, VerificationResult

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


def _visible(state: StateDep, job: JobPosting) -> bool:
    # Verification is a rebuildable cache — recompute on a miss (e.g. after a
    # restart where jobs were loaded from the DB but the cache is cold).
    v = state.verifications.get(job.id)
    if v is None:
        v = state.verification.verify(job)
        state.verifications[job.id] = v
    return v.display_action != "hidden"


@router.get("", response_model=list[JobPosting])
def list_jobs(
    state: StateDep,
    _user: CurrentUser,
    title: Optional[str] = None,
    location: Optional[str] = None,
    remote: Optional[bool] = None,
    min_salary: Optional[int] = None,
    include_hidden: bool = False,
) -> list[JobPosting]:
    results = []
    for job in state.jobs.all():
        if title and title.lower() not in job.title.lower():
            continue
        if location and location.lower() not in job.location.lower():
            continue
        if remote is not None and job.remote != remote:
            continue
        if min_salary is not None and (
            job.salary_range is None or (job.salary_range.maximum or 0) < min_salary
        ):
            continue
        if not include_hidden and not _visible(state, job):
            continue
        results.append(job)
    return results


@router.get("/matches", response_model=list[MatchOut])
def matches(
    state: StateDep,
    user: CurrentUser,
    limit: int = Query(20, ge=1, le=100),
    min_score: float = 0.0,
) -> list[MatchOut]:
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    visible = [j for j in state.jobs.all() if _visible(state, j)]
    ranked = state.matching.rank(profile, visible, limit=limit, min_score=min_score)
    out = []
    for r in ranked:
        v = state.verifications.get(r.job.id)
        out.append(
            MatchOut(
                job_id=r.job.id,
                title=r.job.title,
                company=r.job.company,
                score=r.score,
                matching_skills=r.matching_skills,
                gap_skills=r.gap_skills,
                authenticity_score=v.authenticity_score if v else None,
            )
        )
    return out


_EXPORT_COLUMNS = [
    "rank", "title", "company", "location", "remote", "salary_min", "salary_max",
    "currency", "fit_score", "authenticity_score", "matching_skills", "gap_skills",
    "url", "job_id",
]


def _export_rows(state: StateDep, user_id: str, ids: Optional[set[str]]) -> list[dict]:
    profile = state.profiles.get(user_id) or UserProfile(user_id=user_id)
    visible = [j for j in state.jobs.all() if _visible(state, j)]
    ranked = state.matching.rank(profile, visible, limit=len(visible) or 1)
    rows: list[dict] = []
    for r in ranked:
        if ids is not None and r.job.id not in ids:
            continue
        v = state.verifications.get(r.job.id)
        sr = r.job.salary_range
        rows.append({
            "rank": len(rows) + 1,
            "title": r.job.title,
            "company": r.job.company,
            "location": r.job.location,
            "remote": r.job.remote,
            "salary_min": sr.minimum if sr else None,
            "salary_max": sr.maximum if sr else None,
            "currency": sr.currency if sr else "",
            "fit_score": round(r.score),
            "authenticity_score": v.authenticity_score if v else None,
            "matching_skills": r.matching_skills,
            "gap_skills": r.gap_skills,
            "url": r.job.url,
            "job_id": r.job.id,
        })
    return rows


@router.get("/matches/export")
def export_matches(
    state: StateDep,
    user: CurrentUser,
    format: Literal["csv", "json"] = "csv",
    ids: str = Query("", description="comma-separated job ids to include (e.g. saved jobs); blank = all"),
) -> Response:
    """Download the ranked job recommendations as CSV or JSON.

    Pass ``ids`` (e.g. the user's saved-job ids) to export just those; omit it to
    export every current match. Skills are ``;``-joined in CSV, arrays in JSON.
    """
    id_set = {i for i in (s.strip() for s in ids.split(",")) if i} or None
    rows = _export_rows(state, user.id, id_set)

    if format == "json":
        body = json.dumps({"matches": rows}, indent=2)
        return Response(
            content=body,
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="job-recommendations.json"'},
        )

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_EXPORT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        flat = dict(row)
        flat["matching_skills"] = "; ".join(row["matching_skills"])
        flat["gap_skills"] = "; ".join(row["gap_skills"])
        writer.writerow(flat)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="job-recommendations.csv"'},
    )


@router.post("/ingest", status_code=status.HTTP_201_CREATED)
def ingest(body: IngestRequest, state: StateDep, _user: CurrentUser) -> dict:
    """Store postings and verify each (admin/internal use)."""
    ingested = 0
    for item in body.jobs:
        job = JobPosting(**item.model_dump())
        state.jobs.add(job)
        state.verifications[job.id] = state.verification.verify(job)
        ingested += 1
    return {"ingested": ingested, "total": len(state.jobs.all())}


# --- saved jobs (bookmarks) -------------------------------------------------
def _saved_id(user_id: str, job_id: str) -> str:
    return f"{user_id}:{job_id}"


@router.post("/saved", response_model=SavedJob, status_code=status.HTTP_201_CREATED)
def save_job(body: SaveJobRequest, user: CurrentUser, state: StateDep) -> SavedJob:
    """Bookmark a job. Idempotent — saving the same job again just updates it."""
    if state.jobs.get(body.job_posting_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    sid = _saved_id(user.id, body.job_posting_id)
    existing = state.saved_jobs.get(sid)
    saved = existing or SavedJob(id=sid, user_id=user.id, job_posting_id=body.job_posting_id)
    if body.note is not None:
        saved.note = body.note
    return state.saved_jobs.add(saved)


@router.get("/saved", response_model=list[JobPosting])
def list_saved_jobs(user: CurrentUser, state: StateDep) -> list[JobPosting]:
    """The user's saved jobs (full postings). Ordered by the user's manual order
    (``display_order``), then most-recently-saved first."""
    saved = sorted(
        state.saved_jobs.find(user_id=user.id),
        key=lambda s: (s.display_order, -s.saved_at.timestamp()),
    )
    out = []
    for s in saved:
        job = state.jobs.get(s.job_posting_id)
        if job is not None:
            out.append(job)
    return out


@router.put("/saved/reorder", response_model=list[JobPosting])
def reorder_saved_jobs(
    body: ReorderSavedRequest, user: CurrentUser, state: StateDep
) -> list[JobPosting]:
    """Persist the user's manual ordering of saved jobs (cross-device). ``ids`` is
    the job ids in the desired order; any saved job not listed keeps its place
    after the listed ones. Returns the newly-ordered saved jobs."""
    positions = {jid: idx for idx, jid in enumerate(body.ids)}
    for s in state.saved_jobs.find(user_id=user.id):
        if s.job_posting_id in positions:
            s.display_order = positions[s.job_posting_id]
            state.saved_jobs.add(s)
    return list_saved_jobs(user, state)


@router.delete("/saved/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsave_job(job_id: str, user: CurrentUser, state: StateDep) -> None:
    sid = _saved_id(user.id, job_id)
    if state.saved_jobs.get(sid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job is not saved")
    state.saved_jobs.delete(sid)


@router.get("/{job_id}", response_model=JobPosting)
def get_job(job_id: str, state: StateDep, _user: CurrentUser) -> JobPosting:
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


@router.get("/{job_id}/verification", response_model=VerificationResult)
def get_verification(job_id: str, state: StateDep, _user: CurrentUser) -> VerificationResult:
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    result = state.verifications.get(job_id)
    if result is None:
        result = state.verification.verify(job)
        state.verifications[job_id] = result
    return result
