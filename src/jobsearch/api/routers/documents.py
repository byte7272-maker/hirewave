"""§5.4 Resume & cover letter generation."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    CoverLetterGenerateRequest,
    CoverLetterUpdate,
    ResumeGenerateRequest,
    ResumeReviewRequest,
    ResumeReviseRequest,
    ResumeUpdate,
)
from jobsearch.models import (
    CoverLetter,
    CoverLetterReview,
    CoverLetterRevision,
    CoverLetterSource,
    Resume,
    ResumeFormat,
    ResumeReview,
    ResumeRevision,
    ResumeSource,
    UserProfile,
)
from jobsearch.textextract import extract_text

_EXT_FORMAT = {
    "pdf": ResumeFormat.PDF,
    "docx": ResumeFormat.DOCX,
    "doc": ResumeFormat.DOCX,
    "md": ResumeFormat.MARKDOWN,
    "markdown": ResumeFormat.MARKDOWN,
    "txt": ResumeFormat.TXT,
}

router = APIRouter(prefix="/api/v1", tags=["documents"])


def _require_job(state: StateDep, job_id: str):
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    return job


def _profile(state: StateDep, user_id: str) -> UserProfile:
    return state.profiles.get(user_id) or UserProfile(user_id=user_id)


# --- resumes ----------------------------------------------------------------
@router.post("/resumes/generate", response_model=Resume, status_code=status.HTTP_201_CREATED)
def generate_resume(body: ResumeGenerateRequest, user: CurrentUser, state: StateDep) -> Resume:
    job = _require_job(state, body.job_posting_id)
    profile = _profile(state, user.id)
    # Version bumps per (user, job).
    prior = [
        r for r in state.resumes.find(user_id=user.id) if r.job_posting_id == job.id
    ]
    resume = state.generation.generate_resume(
        profile, job, tone=body.tone, format=body.format, version=len(prior) + 1
    )
    return state.resumes.add(resume)


@router.post("/resumes/upload", response_model=Resume, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    user: CurrentUser,
    state: StateDep,
    file: UploadFile = File(...),
    target_role: str = Form(""),
) -> Resume:
    """Upload the user's own résumé file (PDF/DOCX/MD/TXT) to use in applications."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )

    filename = file.filename or "resume"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    fmt = _EXT_FORMAT.get(ext, ResumeFormat.PDF)

    resume = Resume(
        user_id=user.id,
        source=ResumeSource.UPLOADED,
        target_role=target_role,
        format=fmt,
        original_filename=filename,
        content_type=file.content_type or "application/octet-stream",
    )
    state.documents.put(resume.id, data, content_type=resume.content_type)
    resume.file_url = f"/api/v1/resumes/{resume.id}/file"
    # Extract readable text (txt/md directly, PDF/DOCX best-effort) for review,
    # ATS, and interview prep. Empty for unparseable binaries → callers fall back.
    resume.rendered_text = extract_text(
        data, filename=filename, content_type=resume.content_type
    )[:20000]
    return state.resumes.add(resume)


@router.get("/resumes/{resume_id}/file")
def download_resume_file(resume_id: str, user: CurrentUser, state: StateDep) -> Response:
    resume = get_resume(resume_id, user, state)  # 404s if not owned
    stored = state.documents.get(resume.id)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no file stored for this resume")
    data, content_type = stored
    fname = resume.original_filename or f"resume.{resume.format.value}"
    return Response(
        content=data,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/resumes", response_model=list[Resume])
def list_resumes(user: CurrentUser, state: StateDep) -> list[Resume]:
    return state.resumes.find(user_id=user.id)


def ensure_rendered_text(state: StateDep, resume: Resume) -> Resume:
    """Self-heal: if a résumé has no extracted text but its file is stored,
    re-extract now (e.g. after the PDF/DOCX parser became available) and persist."""
    if resume.rendered_text or state.documents is None:
        return resume
    try:
        stored = state.documents.get(resume.id)
    except Exception:  # noqa: BLE001
        stored = None
    if stored:
        data, ctype = stored
        text = extract_text(data, filename=resume.original_filename, content_type=ctype)[:20000]
        if text:
            resume.rendered_text = text
            state.resumes.add(resume)
    return resume


@router.get("/resumes/{resume_id}", response_model=Resume)
def get_resume(resume_id: str, user: CurrentUser, state: StateDep) -> Resume:
    resume = state.resumes.get(resume_id)
    if resume is None or resume.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    return ensure_rendered_text(state, resume)


@router.put("/resumes/{resume_id}", response_model=Resume)
def update_resume(
    resume_id: str, body: ResumeUpdate, user: CurrentUser, state: StateDep
) -> Resume:
    resume = get_resume(resume_id, user, state)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(resume, field, value)
    return state.resumes.add(resume)  # persist the mutation (no-op for in-memory)


@router.post("/resumes/{resume_id}/review", response_model=ResumeReview)
def review_resume(
    resume_id: str, body: ResumeReviewRequest, user: CurrentUser, state: StateDep
) -> ResumeReview:
    """Analyze a résumé — score, strengths, concrete suggested changes, and (if a
    job is given) the requirements it's missing. Read-only; changes nothing."""
    resume = get_resume(resume_id, user, state)
    job = _require_job(state, body.job_posting_id) if body.job_posting_id else None
    return state.resume_assistant.review(resume, job=job)


@router.post("/resumes/{resume_id}/revise", response_model=ResumeRevision)
def revise_resume(
    resume_id: str, body: ResumeReviseRequest, user: CurrentUser, state: StateDep
) -> ResumeRevision:
    """Prompt-controlled AI rewrite. Returns a **preview** grounded in the résumé's
    real facts — nothing is saved. To apply it, PUT the preview back as
    ``rendered_text`` (keeps the human-in-the-loop)."""
    resume = get_resume(resume_id, user, state)
    job = _require_job(state, body.job_posting_id) if body.job_posting_id else None
    try:
        return state.resume_assistant.revise(resume, body.instruction, job=job)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.delete("/resumes/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume(resume_id: str, user: CurrentUser, state: StateDep) -> None:
    resume = get_resume(resume_id, user, state)
    state.resumes.delete(resume.id)


# --- cover letters ----------------------------------------------------------
@router.post(
    "/cover-letters/generate", response_model=CoverLetter, status_code=status.HTTP_201_CREATED
)
def generate_cover_letter(
    body: CoverLetterGenerateRequest, user: CurrentUser, state: StateDep
) -> CoverLetter:
    job = _require_job(state, body.job_posting_id)
    profile = _profile(state, user.id)
    resume = state.resumes.get(body.resume_id) if body.resume_id else None
    if body.resume_id and (resume is None or resume.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    cl = state.generation.generate_cover_letter(profile, job, resume=resume, tone=body.tone)
    return state.cover_letters.add(cl)


@router.post(
    "/cover-letters/upload", response_model=CoverLetter, status_code=status.HTTP_201_CREATED
)
async def upload_cover_letter(
    user: CurrentUser,
    state: StateDep,
    file: UploadFile = File(...),
    job_posting_id: str = Form(""),
    resume_id: str = Form(""),
) -> CoverLetter:
    """Upload the user's own cover-letter file (PDF/DOCX/MD/TXT). Optionally tie it
    to a job and résumé; leave those blank for a generic letter."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    if job_posting_id:
        _require_job(state, job_posting_id)  # 404 if it doesn't exist
    if resume_id:
        r = state.resumes.get(resume_id)
        if r is None or r.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")

    filename = file.filename or "cover-letter"
    content_type = file.content_type or "application/octet-stream"
    cl = CoverLetter(
        user_id=user.id,
        job_posting_id=job_posting_id or None,
        resume_id=resume_id or None,
        source=CoverLetterSource.UPLOADED,
        original_filename=filename,
        content_type=content_type,
        # Readable text for review / applications (empty for unparseable binaries).
        content=extract_text(data, filename=filename, content_type=content_type)[:20000],
    )
    state.documents.put(cl.id, data, content_type=content_type)
    cl.file_url = f"/api/v1/cover-letters/{cl.id}/file"
    return state.cover_letters.add(cl)


@router.get("/cover-letters", response_model=list[CoverLetter])
def list_cover_letters(user: CurrentUser, state: StateDep) -> list[CoverLetter]:
    return state.cover_letters.find(user_id=user.id)


@router.get("/cover-letters/{cover_letter_id}/file")
def download_cover_letter_file(
    cover_letter_id: str, user: CurrentUser, state: StateDep
) -> Response:
    cl = get_cover_letter(cover_letter_id, user, state)  # 404s if not owned
    stored = state.documents.get(cl.id)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no file stored for this cover letter")
    data, content_type = stored
    fname = cl.original_filename or "cover-letter.txt"
    return Response(
        content=data,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/cover-letters/{cover_letter_id}", response_model=CoverLetter)
def get_cover_letter(cover_letter_id: str, user: CurrentUser, state: StateDep) -> CoverLetter:
    cl = state.cover_letters.get(cover_letter_id)
    if cl is None or cl.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cover letter not found")
    return cl


@router.delete("/cover-letters/{cover_letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cover_letter(cover_letter_id: str, user: CurrentUser, state: StateDep) -> None:
    cl = get_cover_letter(cover_letter_id, user, state)
    state.documents.delete(cl.id)
    state.cover_letters.delete(cl.id)


@router.put("/cover-letters/{cover_letter_id}", response_model=CoverLetter)
def update_cover_letter(
    cover_letter_id: str, body: CoverLetterUpdate, user: CurrentUser, state: StateDep
) -> CoverLetter:
    cl = get_cover_letter(cover_letter_id, user, state)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cl, field, value)
    return state.cover_letters.add(cl)  # persist the mutation


@router.post("/cover-letters/{cover_letter_id}/review", response_model=CoverLetterReview)
def review_cover_letter(
    cover_letter_id: str, body: ResumeReviewRequest, user: CurrentUser, state: StateDep
) -> CoverLetterReview:
    """Analyze a cover letter — score, strengths, and concrete suggested changes
    (length, clichés, specificity, personalization). Read-only."""
    cl = get_cover_letter(cover_letter_id, user, state)
    job_id = body.job_posting_id or cl.job_posting_id
    job = _require_job(state, job_id) if job_id else None
    return state.resume_assistant.review_cover_letter(cl, job=job)


@router.post("/cover-letters/{cover_letter_id}/revise", response_model=CoverLetterRevision)
def revise_cover_letter(
    cover_letter_id: str, body: ResumeReviseRequest, user: CurrentUser, state: StateDep
) -> CoverLetterRevision:
    """Prompt-controlled AI rewrite of a cover letter. Returns a **preview**
    grounded in the letter's real facts — nothing is saved. Apply via
    ``PUT /cover-letters/{id} { content: <preview> }``."""
    cl = get_cover_letter(cover_letter_id, user, state)
    job_id = body.job_posting_id or cl.job_posting_id
    job = _require_job(state, job_id) if job_id else None
    try:
        return state.resume_assistant.revise_cover_letter(cl, body.instruction, job=job)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
