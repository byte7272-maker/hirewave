"""Multi-site job sourcing agent — on-demand search + scheduled saved searches.

Uses its own ``/job-search`` prefix so the single-segment ``/searches`` routes
never collide with ``/jobs/{job_id}``.
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AggregationOut,
    EmailImportOut,
    JobSearchRunRequest,
    SavedSearchCreate,
    SavedSearchUpdate,
)
from jobsearch.engines.sourcing import AggregationResult, JobQuery, parse_job_alert
from jobsearch.models import SavedSearch

router = APIRouter(prefix="/api/v1/job-search", tags=["job-search"])


def _out(r: AggregationResult) -> AggregationOut:
    return AggregationOut(
        found=r.found, ingested=r.ingested, duplicates=r.duplicates,
        hidden=r.hidden, sources=r.sources, job_ids=r.job_ids,
    )


@router.post("/run", response_model=AggregationOut)
def run_search(body: JobSearchRunRequest, user: CurrentUser, state: StateDep) -> AggregationOut:
    """Search across the configured job sites now and ingest new postings.

    Fans out across every enabled source (or just ``sources``), normalizes and
    de-duplicates, runs the fraud filter, and stores the new roles so they show
    up in the user's ranked matches. Returns a summary of what was found.
    """
    if not body.role.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "role is required")
    query = JobQuery(role=body.role, location=body.location, remote=body.remote)
    result = state.aggregator.search(query, sources_filter=set(body.sources) if body.sources else None)
    out = _out(result)
    # If the user enabled draft-prep, auto-prepare drafts for new strong matches.
    if result.ingested and state.assistant.has(user.id, "draft_prep"):
        out.drafts_prepared = len(state.draft_prep.run(user.id))
    return out


@router.post("/import-email", response_model=EmailImportOut)
async def import_email(
    user: CurrentUser, state: StateDep, file: UploadFile = File(...)
) -> EmailImportOut:
    """Ingest roles from a job-alert email the user forwards/uploads (``.eml``).

    Consent-based — it's the user's own email. We detect the board from the
    sender, extract the listed roles, and run them through the same
    dedupe → verify → ingest pipeline as a live search.
    """
    data = await file.read()
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    alert = parse_job_alert(data)
    result = state.aggregator.ingest(alert.postings, sources={alert.source} if alert.source else None)
    return EmailImportOut(source=alert.source, parsed=len(alert.postings), result=_out(result))


@router.get("/searches", response_model=list[SavedSearch])
def list_saved(user: CurrentUser, state: StateDep) -> list[SavedSearch]:
    return state.saved_search.list(user.id)


@router.post("/searches", response_model=SavedSearch, status_code=status.HTTP_201_CREATED)
def create_saved(body: SavedSearchCreate, user: CurrentUser, state: StateDep) -> SavedSearch:
    """Save a search the agent re-runs on a schedule (notifying you of new roles)."""
    try:
        return state.saved_search.create(
            user.id, role=body.role, location=body.location, remote=body.remote,
            sources=body.sources, interval_minutes=body.interval_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.put("/searches/{search_id}", response_model=SavedSearch)
def update_saved(search_id: str, body: SavedSearchUpdate, user: CurrentUser, state: StateDep) -> SavedSearch:
    s = state.saved_search.set_active(search_id, user.id, body.active)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "saved search not found")
    return s


@router.delete("/searches/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved(search_id: str, user: CurrentUser, state: StateDep) -> None:
    if not state.saved_search.delete(search_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "saved search not found")


@router.post("/searches/{search_id}/run", response_model=AggregationOut)
def run_saved(search_id: str, user: CurrentUser, state: StateDep) -> AggregationOut:
    result = state.saved_search.run_now(search_id, user.id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "saved search not found")
    return _out(result)


@router.post("/run-due", response_model=list[AggregationOut])
def run_due(user: CurrentUser, state: StateDep) -> list[AggregationOut]:
    """Run every saved search that's due (the hook a scheduler/cron calls)."""
    return [_out(r) for r in state.saved_search.run_due(user.id)]
