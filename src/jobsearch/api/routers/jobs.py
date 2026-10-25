"""§5.3 Job postings & matching."""

from __future__ import annotations

import csv
import io
import json
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AggregationOut,
    ExternalIngestRequest,
    IngestRequest,
    MatchOut,
    MatchReasonOut,
    ReorderSavedRequest,
    SaveJobRequest,
)
from jobsearch.engines.sourcing.skills import (
    CATEGORIES,
    CATEGORY_VERSION,
    detect_category,
    extract_skills,
)
from jobsearch.models import JobPosting, SavedJob, UserProfile, VerificationResult

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


def _match_pool(state: StateDep, user_id: str) -> list[JobPosting]:
    """A user's own private pool of postings — only the jobs they ingested/pulled/
    forwarded (plus their seeded samples until they ingest). Never other users'."""
    return [j for j in state.jobs.all() if getattr(j, "owner_id", "") == user_id]


def _clear_sample_jobs(state: StateDep, user_id: str) -> None:
    """Remove the user's seeded sample postings once real jobs arrive. Best-effort."""
    try:
        from jobsearch.engines.demo_seed import clear_sample_jobs

        clear_sample_jobs(state, user_id)
    except Exception:  # noqa: BLE001
        pass


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
    for job in _match_pool(state, _user.id):  # only the user's own postings
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


def _matching_profile(state: StateDep, user_id: str, resume_id: str) -> UserProfile:
    """The profile to rank against. With ``resume_id`` the ranking is driven by
    that résumé's text + the skills mined from it (so matches reflect the résumé
    the user chose), layered over their structured profile."""
    profile = state.profiles.get(user_id) or UserProfile(user_id=user_id)
    if not resume_id:
        return profile
    resume = state.resumes.get(resume_id)
    if resume is None or resume.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    from jobsearch.api.routers.documents import ensure_rendered_text
    resume = ensure_rendered_text(state, resume)  # heal empty text from stored file
    text = (resume.rendered_text or "").strip()
    skills = list(dict.fromkeys([*profile.skills, *extract_skills(text, limit=25)]))
    return profile.model_copy(update={
        "summary": text[:4000] or profile.summary,
        "skills": skills,
        "headline": profile.headline or resume.target_role,
    })


@router.get("/categories")
def job_categories(_user: CurrentUser) -> dict:
    """The broad job categories a user can pick to focus their matches on."""
    return {"categories": CATEGORIES}


@router.get("/matches", response_model=list[MatchOut])
def matches(
    state: StateDep,
    user: CurrentUser,
    limit: Optional[int] = Query(None, ge=1, description="max matches to return; omit for all"),
    min_score: float = 0.0,
    resume_id: Optional[str] = Query(None, description="rank against this résumé (user picks when several)"),
    categories: str = Query("", description="comma-separated broad categories to focus on; blank = your saved prefs"),
) -> list[MatchOut]:
    profile = _matching_profile(state, user.id, resume_id)
    # Category focus: explicit query wins, else the user's saved preference.
    selected = {c.strip() for c in categories.split(",") if c.strip()}
    if not selected:
        selected = set(profile.preferences.job_categories)
    # Fresh accounts see only their sample matches; others see the real pool.
    visible = [j for j in _match_pool(state, user.id) if _visible(state, j)]
    # Lazily (re)classify jobs whose category predates the current classifier, so
    # the category focus works on the whole pool (self-heals on read, once).
    for j in visible:
        if not j.category or getattr(j, "category_version", 0) < CATEGORY_VERSION:
            j.category = detect_category(f"{j.title} {j.title} {j.description}")
            j.category_version = CATEGORY_VERSION
            state.jobs.add(j)
    if selected:
        visible = [j for j in visible if (j.category or "Other") in selected]
    ranked = state.matching.rank(profile, visible, limit=limit, min_score=min_score)
    out = []
    for r in ranked:
        v = state.verifications.get(r.job.id)
        b = r.breakdown
        out.append(
            MatchOut(
                job_id=r.job.id,
                title=r.job.title,
                company=r.job.company,
                score=r.score,
                reasons=[MatchReasonOut(label=x.label, detail=x.detail, sentiment=x.sentiment)
                         for x in r.reasons],
                breakdown={
                    "semantic": round(b.semantic * 100), "skills": round(b.skills * 100),
                    "location": round(b.location * 100), "salary": round(b.salary * 100),
                    "seniority": round(b.seniority * 100), "recency": round(b.recency * 100),
                },
                matching_skills=r.matching_skills,
                gap_skills=r.gap_skills,
                authenticity_score=v.authenticity_score if v else None,
                url=r.job.url,
                location=r.job.location,
                remote=r.job.remote,
                posted_ago=r.job.posted_ago,
                added_ago=r.job.added_ago,
                source_platform=r.job.source_platform,
                source_slug=r.job.source_slug,
                source_display=r.job.source_display,
                source_logo=r.job.source_logo,
                source_url=r.job.source_url,
                category=r.job.category,
                is_sample=getattr(r.job, "is_sample", False),
                salary_range=r.job.salary_range,
                salary_display=r.job.salary_display,
                company_logo=r.job.company_logo,
                likely_duplicate=r.job.likely_duplicate,
                duplicate_group_id=r.job.duplicate_group_id,
                cross_posting_ids=r.job.cross_posting_ids,
                consolidated_count=r.job.consolidated_count,
                consolidated_sources=r.job.consolidated_sources,
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
    visible = [j for j in _match_pool(state, user_id) if _visible(state, j)]
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
    """Store postings and verify each (admin/internal use). Does NOT de-duplicate —
    prefer ``/ingest-external`` for client/browser pulls that may repeat."""
    ingested = 0
    for item in body.jobs:
        job = JobPosting(**item.model_dump())
        job.owner_id = _user.id  # private per-user pool
        state.jobs.add(job)
        state.verifications[job.id] = state.verification.verify(job)
        ingested += 1
    if ingested:
        _clear_sample_jobs(state, _user.id)
    return {"ingested": ingested, "total": len(state.jobs.all())}


@router.post("/ingest-external", response_model=AggregationOut)
def ingest_external(body: ExternalIngestRequest, state: StateDep, _user: CurrentUser) -> AggregationOut:
    """Provider-AGNOSTIC ingest for client/browser pulls (e.g. the Connect
    extension scraping LinkedIn/Indeed/Glassdoor/… job pages). De-duplicates via the
    aggregator — cross-board duplicates are linked and identical re-posts collapse —
    so pulling the same page repeatedly won't pile up copies (unlike ``/ingest``).

    Each job carries its own ``source_platform`` (e.g. "linkedin"); ``source`` is a
    fallback applied to any job that doesn't set one. Returns what was ingested vs.
    skipped as duplicates."""
    raw: list[dict] = []
    for item in body.jobs:
        d = item.model_dump()
        if not d.get("source_platform") and body.source:
            d["source_platform"] = body.source
        raw.append(d)
    srcs = {d.get("source_platform") for d in raw if d.get("source_platform")} or {body.source or "extension"}
    result = state.aggregator.ingest(raw, sources=srcs, owner_id=_user.id)
    if result.ingested:  # real jobs arrived — clear the seeded sample matches
        _clear_sample_jobs(state, _user.id)
    return AggregationOut(
        found=result.found, ingested=result.ingested, duplicates=result.duplicates,
        hidden=result.hidden, sources=result.sources, job_ids=result.job_ids,
        matched_job_ids=result.matched_job_ids,
    )


@router.post("/claim-unowned")
def claim_unowned(state: StateDep, user: CurrentUser) -> dict:
    """One-time migration: assign every ownerless (legacy, pre-ownership) posting to
    the calling user's private pool. Jobs ingested before per-user ownership had no
    owner; the account that ran the original searches claims them. Idempotent — once
    claimed there are no ownerless jobs left for anyone else to take."""
    claimed = 0
    for j in state.jobs.all():
        if not getattr(j, "owner_id", "") and not getattr(j, "is_sample", False):
            j.owner_id = user.id
            state.jobs.add(j)
            claimed += 1
    return {"claimed": claimed}


@router.post("/enrich-descriptions")
def enrich_descriptions(
    state: StateDep,
    _user: CurrentUser,
    limit: int = Query(25, ge=1, le=100, description="max jobs to enrich this call"),
    job_ids: str = Query("", description="comma-separated job ids to target; blank = any that need it"),
) -> dict:
    """Pull the **full job description** for matches that only have a placeholder
    body. Fetches each posting's own URL and extracts the real JD (schema.org
    JSON-LD first, then meta description) — provider-agnostic. Best-effort and
    time-boxed: unreachable/auth-walled boards (e.g. a logged-out LinkedIn page)
    are skipped, not failed. Returns how many were enriched.

    Call it after a mailbox scan / board pull, or from a "Get full descriptions"
    action on Matches. Idempotent — a job with a real description is left alone.
    """
    from jobsearch.engines.sourcing.jd_enrich import enrich_job, needs_jd

    wanted = {s.strip() for s in job_ids.split(",") if s.strip()}
    candidates = [
        j for j in _match_pool(state, _user.id)  # only the user's own postings
        if _visible(state, j) and needs_jd(j) and (not wanted or j.id in wanted)
    ]
    checked = enriched = 0
    enriched_ids: list[str] = []
    for job in candidates[:limit]:
        checked += 1
        if enrich_job(job):
            state.jobs.add(job)
            enriched += 1
            enriched_ids.append(job.id)
    return {
        "candidates": len(candidates),
        "checked": checked,
        "enriched": enriched,
        "enriched_job_ids": enriched_ids,
        "remaining": max(0, len(candidates) - checked),
    }


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


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: str, state: StateDep, user: CurrentUser) -> None:
    """Remove a posting from the user's matches. Only the owner can delete it; also
    cleans up the verification cache and any bookmark of it."""
    job = state.jobs.get(job_id)
    if job is None or getattr(job, "owner_id", "") != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    state.jobs.delete(job_id)
    state.verifications.pop(job_id, None)
    state.saved_jobs.delete(_saved_id(user.id, job_id))  # drop a bookmark if any


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
