"""§5.4 Resume & cover letter generation."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import HTMLResponse

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    CoverLetterGenerateRequest,
    CoverLetterStructuredImprovement,
    CoverLetterTailoring,
    CoverLetterUpdate,
    CreateVersionRequest,
    JobCard,
    ResumeGenerateRequest,
    ResumeReviewRequest,
    ResumeReviseRequest,
    RenderedResume,
    ResumeTailoring,
    ResumeUpdate,
    StructuredImprovement,
    TailorRequest,
    VersionReuseSuggestion,
)
from jobsearch.models import DocumentVersion
from jobsearch.models import (
    CoverLetter,
    CoverLetterData,
    CoverLetterReview,
    CoverLetterRevision,
    CoverLetterSource,
    Resume,
    ResumeData,
    ResumeFormat,
    ResumeReview,
    ResumeRevision,
    ResumeSource,
    UserProfile,
)
from jobsearch.docpreview import build_docx, build_pdf, render_text_html, render_text_preview

_DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _docx_response(data, base_name: str):
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no content to export")
    return Response(
        content=data, media_type=_DOCX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{base_name}.docx"'},
    )


def _pdf_response(data, base_name: str):
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no content to export")
    return Response(
        content=data, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.pdf"'},
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


#: Fallback when the user clicks "Improve" without picking any specific prompt, so
#: a generic improve always produces a rewrite instead of an error.
_GENERAL_IMPROVE = (
    "Improve this document overall: strengthen impact with quantified results, lead "
    "with strong action verbs, tighten the wording, and keep it ATS-friendly -- "
    "without inventing any facts."
)


def _combine_instructions(instruction: str, instructions: list[str]) -> str:
    """Fold one or many selected prompts into a single instruction. Multiple prompts
    are framed so the LLM applies them all in one coherent rewrite. With none given,
    fall back to a general improvement so a bare "Improve" button still works."""
    items: list[str] = []
    for s in [*(instructions or []), instruction]:
        s = (s or "").strip()
        if s and s not in items:
            items.append(s)
    if not items:
        return _GENERAL_IMPROVE
    if len(items) == 1:
        return items[0]
    return "Apply ALL of these changes together in one rewrite:\n" + "\n".join(f"- {s}" for s in items)


def _add_version(doc, *, text_attr, new_content, label, source, instruction, job, state):
    """Append a new version to a résumé/cover letter, seeding the current text as the
    'Original' first time, set it active, and point the doc's live text at it."""
    old = getattr(doc, text_attr) or ""
    if not doc.versions:
        doc.versions = [DocumentVersion(version=1, label="Original", content=old, source="original")]
    next_v = max(v.version for v in doc.versions) + 1
    summary = state.resume_assistant.summarize_change(old, new_content, instruction=instruction, job=job)
    default_label = (job.category if job else "") or (job.title if job else "") or f"Version {next_v}"
    doc.versions.append(DocumentVersion(
        version=next_v, label=(label or default_label), content=new_content,
        change_summary=summary, source=source, instruction=instruction,
        job_posting_id=(job.id if job else ""), job_title=(job.title if job else ""),
        job_company=(job.company if job else ""), job_category=(job.category if job else ""),
    ))
    doc.active_version = next_v
    setattr(doc, text_attr, new_content)


def _reuse_suggestion(versions, job) -> VersionReuseSuggestion:
    """Pick the saved version that best fits ``job`` (category match + requirement
    coverage) and say what tweaks it needs — so a past version can be reused."""
    reqs = [r for r in job.requirements if r]
    total = len(reqs)
    best = None
    best_score = -1
    best_cov: list[str] = []
    for v in versions or []:
        low = (v.content or "").lower()
        cov = [r for r in reqs if r.lower() in low]
        score = len(cov) * 2 + (5 if (v.job_category and v.job_category == job.category) else 0)
        if score > best_score:
            best_score, best, best_cov = score, v, cov
    if best is None:
        return VersionReuseSuggestion(
            job=JobCard.from_job(job), reuse_recommended=False,
            recommendation=f"No saved versions yet. Tailor this document for {job.title}.",
        )
    missing = [r for r in reqs if r.lower() not in (best.content or "").lower()]
    fit = round(100 * len(best_cov) / total) if total else 0
    same_cat = bool(best.job_category and best.job_category == job.category)
    reuse = fit >= 60 or same_cat
    if reuse:
        rec = f"Reuse your '{best.label}' version"
        if best.job_title:
            rec += f" (tailored for {best.job_title})"
        rec += "."
        if best_cov:
            rec += f" It already covers {', '.join(best_cov[:5])}."
        rec += (f" Add {', '.join(missing[:5])} to fit {job.title}." if missing
                else f" It fits {job.title} well as-is.")
    else:
        rec = f"No saved version closely fits {job.title}. Tailor your active version for it."
    return VersionReuseSuggestion(
        job=JobCard.from_job(job), best_version=best.version, best_label=best.label,
        fit=fit, covered=best_cov, missing=missing, reuse_recommended=reuse, recommendation=rec,
    )


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
    return ensure_resume_grade(state, state.resumes.add(resume))


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


@router.get("/resumes/{resume_id}/preview.png")
def resume_preview(
    resume_id: str,
    user: CurrentUser,
    state: StateDep,
    scale: int = Query(1, ge=1, le=3, description="pixel scale factor (crispness)"),
) -> Response:
    """A page-image (PNG) preview of the résumé, rendered from its text so it works
    for PDF, DOCX, MD and TXT alike. 404s if there's no readable text to render."""
    resume = get_resume(resume_id, user, state)  # heals empty text; 404s if not owned
    png = render_text_preview(
        resume.rendered_text or "",
        title=resume.original_filename or resume.target_role or "Resume",
        scale=scale,
    )
    if png is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no preview available (no readable text)")
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/resumes/{resume_id}/preview.html", response_class=HTMLResponse)
def resume_preview_html(resume_id: str, user: CurrentUser, state: StateDep) -> HTMLResponse:
    """A reflowable, zoomable HTML preview of the résumé (active version). Unlike the
    PNG it wraps to any width and magnifies with native zoom, so the viewer can offer
    real fit-width / magnify controls. 404s when there's no readable text."""
    resume = get_resume(resume_id, user, state)
    doc = render_text_html(
        resume.rendered_text or "",
        title=resume.original_filename or resume.target_role or "Resume",
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no preview available (no readable text)")
    return HTMLResponse(content=doc, headers={"Cache-Control": "private, max-age=300"})


@router.get("/resumes/{resume_id}/structured", response_model=ResumeData)
def resume_structured(resume_id: str, user: CurrentUser, state: StateDep) -> ResumeData:
    """The résumé parsed into the JSON Resume schema (structured fields) — the model
    the frontend renders into templates/themes and that AI improvements target."""
    resume = get_resume(resume_id, user, state)
    return state.resume_assistant.structure(resume)


@router.get("/resumes/{resume_id}/render", response_model=RenderedResume)
def render_resume_with_template(
    resume_id: str, user: CurrentUser, state: StateDep,
    template_id: str = Query(..., description="the template to place the résumé onto"),
) -> RenderedResume:
    """The finished project: the résumé's structured content placed onto a chosen
    template. The frontend renders ``data`` with ``template.style``; the user then
    tweaks. Bumps the template's use count (popularity)."""
    from jobsearch.models import BUILTIN_TEMPLATES

    resume = get_resume(resume_id, user, state)
    template = next((t for t in BUILTIN_TEMPLATES if t.id == template_id), None) \
        or state.resume_templates.get(template_id)
    if template is None or not template.shared:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    if template.created_by:  # a stored (non-builtin) template — track usage
        template.uses += 1
        state.resume_templates.add(template)
    data = state.resume_assistant.structure(resume)
    return RenderedResume(template=template, data=data)


@router.post("/resumes/{resume_id}/improve-structured", response_model=StructuredImprovement)
def improve_resume_structured(
    resume_id: str, body: ResumeReviseRequest, user: CurrentUser, state: StateDep
) -> StructuredImprovement:
    """AI-improve the résumé and return it as structured JSON Resume (so improvements
    apply per-field and the chosen template's formatting stays intact), plus the
    ``markdown`` to save. Read-only preview — accept by POSTing the markdown to
    ``/resumes/{id}/versions``."""
    from jobsearch.models.resume_schema import find_new_metrics, resume_data_to_markdown

    resume = get_resume(resume_id, user, state)
    job = _require_job(state, body.job_posting_id) if body.job_posting_id else None
    focus = _combine_instructions(body.instruction, body.instructions)
    improved = state.resume_assistant.improve_structured(resume, instruction=focus, job=job)
    return StructuredImprovement(
        structured=improved,
        markdown=resume_data_to_markdown(improved),
        flagged_metrics=find_new_metrics(resume.rendered_text or "", improved),
    )


@router.get("/resumes/{resume_id}/export.docx")
def export_resume_docx(resume_id: str, user: CurrentUser, state: StateDep) -> Response:
    """Download the résumé (active version) as a professionally-formatted Word (.docx)
    document — real font, section headings, and bullet lists. A fresh formatted file,
    not the original upload. 404s when there's no readable text."""
    resume = get_resume(resume_id, user, state)
    base = (resume.original_filename or "resume").rsplit(".", 1)[0]
    return _docx_response(build_docx(resume.rendered_text or "", title=resume.target_role or "Resume"), base)


@router.get("/resumes/{resume_id}/export.pdf")
def export_resume_pdf(resume_id: str, user: CurrentUser, state: StateDep) -> Response:
    """Download the résumé (active version) as a clean, formatted PDF."""
    resume = get_resume(resume_id, user, state)
    base = (resume.original_filename or "resume").rsplit(".", 1)[0]
    return _pdf_response(build_pdf(resume.rendered_text or "", title=resume.target_role or "Resume"), base)


@router.get("/resumes", response_model=list[Resume])
def list_resumes(user: CurrentUser, state: StateDep) -> list[Resume]:
    return [
        ensure_resume_grade(state, ensure_rendered_text(state, r))
        for r in state.resumes.find(user_id=user.id)
    ]


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


def ensure_resume_grade(state: StateDep, resume: Resume) -> Resume:
    """Populate the cached document-quality grade (no target job) if missing, so
    list cards can show it without firing a full (LLM) review per item. The score
    is deterministic — ``narrative=False`` skips the LLM entirely."""
    if resume.quality_grade or not (resume.rendered_text or "").strip():
        return resume
    r = state.resume_assistant.review(resume, narrative=False)
    resume.quality_score = r.score
    resume.quality_grade = r.grade
    state.resumes.add(resume)
    return resume


@router.get("/resumes/{resume_id}", response_model=Resume)
def get_resume(resume_id: str, user: CurrentUser, state: StateDep) -> Resume:
    resume = state.resumes.get(resume_id)
    if resume is None or resume.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    return ensure_resume_grade(state, ensure_rendered_text(state, resume))


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
    review = state.resume_assistant.review(resume, job=job)
    # Refresh the cached card grade from a general (no-job) review; a job-specific
    # review is contextual and must not overwrite the document-quality grade.
    if job is None and (resume.quality_grade != review.grade or resume.quality_score != review.score):
        resume.quality_score = review.score
        resume.quality_grade = review.grade
        state.resumes.add(resume)
    return review


@router.post("/resumes/{resume_id}/tailor", response_model=ResumeTailoring)
def tailor_resume(
    resume_id: str, body: TailorRequest, user: CurrentUser, state: StateDep
) -> ResumeTailoring:
    """Résumé-for-a-job view: echoes the target job, scores how well the résumé fits
    it, gives a candid perspective on qualifications, and lists concrete changes to
    tailor the résumé for it. Read-only — the user then revises with this job id."""
    from jobsearch.api.routers.jobs import _matching_profile

    resume = get_resume(resume_id, user, state)
    job = _require_job(state, body.job_posting_id)
    # Fit: rank the résumé-driven profile against this one job.
    profile = _matching_profile(state, user.id, resume.id)
    fit = state.matching.score(profile, job)
    # Job-aware review supplies the missing keywords + concrete tailoring changes.
    review = state.resume_assistant.review(resume, job=job)
    qualifications = state.resume_assistant.qualifications(
        resume, job, fit_score=round(fit.score),
        matching_skills=fit.matching_skills, gap_skills=fit.gap_skills,
    )
    return ResumeTailoring(
        resume_id=resume.id,
        job=JobCard.from_job(job),
        fit_score=round(fit.score),
        matching_skills=fit.matching_skills,
        missing_keywords=review.missing_keywords,
        qualifications=qualifications,
        summary=review.summary,
        tailoring=review.suggestions,
    )


@router.post("/resumes/{resume_id}/versions", response_model=Resume)
def create_resume_version(
    resume_id: str, body: CreateVersionRequest, user: CurrentUser, state: StateDep
) -> Resume:
    """Save an accepted rewrite as a new version, make it active (so the document
    view + preview show it), and record a summary of what changed. Returns the résumé
    with its full version history for the switcher."""
    if not (body.content or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "content is required")
    resume = get_resume(resume_id, user, state)
    job = _require_job(state, body.job_posting_id) if body.job_posting_id else None
    _add_version(resume, text_attr="rendered_text", new_content=body.content, label=body.label,
                 source=("tailored" if job else "revision"), instruction=body.instruction,
                 job=job, state=state)
    resume.quality_score = None  # active text changed -> re-grade cheaply
    resume.quality_grade = ""
    state.resumes.add(resume)
    return ensure_resume_grade(state, resume)


@router.post("/resumes/{resume_id}/versions/{version}/activate", response_model=Resume)
def activate_resume_version(
    resume_id: str, version: int, user: CurrentUser, state: StateDep
) -> Resume:
    """Switch the active version — the document view/preview/matching all follow."""
    resume = get_resume(resume_id, user, state)
    ver = next((v for v in resume.versions if v.version == version), None)
    if ver is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "version not found")
    resume.active_version = version
    resume.rendered_text = ver.content
    resume.quality_score = None
    resume.quality_grade = ""
    state.resumes.add(resume)
    return ensure_resume_grade(state, resume)


@router.get("/resumes/{resume_id}/reuse", response_model=VersionReuseSuggestion)
def suggest_resume_reuse(
    resume_id: str, user: CurrentUser, state: StateDep,
    job_posting_id: str = Query(..., description="the new job to check saved versions against"),
) -> VersionReuseSuggestion:
    """Suggest reusing a previously-tailored version for a new job (with the tweaks
    it needs), so the user doesn't start from scratch for a similar opportunity."""
    resume = get_resume(resume_id, user, state)
    job = _require_job(state, job_posting_id)
    return _reuse_suggestion(resume.versions, job)


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
        return state.resume_assistant.revise(
            resume, _combine_instructions(body.instruction, body.instructions), job=job
        )
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
    return ensure_cover_letter_grade(state, state.cover_letters.add(cl))


def ensure_cover_letter_grade(state: StateDep, cl: CoverLetter) -> CoverLetter:
    """Populate the cached document-quality grade (no target job) if missing, so
    list cards show it without firing a full (LLM) review per item."""
    if cl.quality_grade or not (cl.content or "").strip():
        return cl
    r = state.resume_assistant.review_cover_letter(cl, narrative=False)
    cl.quality_score = r.score
    cl.quality_grade = r.grade
    state.cover_letters.add(cl)
    return cl


@router.get("/cover-letters/{cover_letter_id}/export.docx")
def export_cover_letter_docx(
    cover_letter_id: str, user: CurrentUser, state: StateDep
) -> Response:
    """Download the cover letter (active version) as a formatted Word (.docx) file."""
    cl = get_cover_letter(cover_letter_id, user, state)
    base = (cl.original_filename or "cover-letter").rsplit(".", 1)[0]
    return _docx_response(build_docx(cl.content or "", title="Cover letter"), base)


@router.get("/cover-letters/{cover_letter_id}/export.pdf")
def export_cover_letter_pdf(
    cover_letter_id: str, user: CurrentUser, state: StateDep
) -> Response:
    """Download the cover letter (active version) as a formatted PDF."""
    cl = get_cover_letter(cover_letter_id, user, state)
    base = (cl.original_filename or "cover-letter").rsplit(".", 1)[0]
    return _pdf_response(build_pdf(cl.content or "", title="Cover letter"), base)


@router.get("/cover-letters", response_model=list[CoverLetter])
def list_cover_letters(user: CurrentUser, state: StateDep) -> list[CoverLetter]:
    return [ensure_cover_letter_grade(state, cl) for cl in state.cover_letters.find(user_id=user.id)]


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


@router.get("/cover-letters/{cover_letter_id}/preview.png")
def cover_letter_preview(
    cover_letter_id: str,
    user: CurrentUser,
    state: StateDep,
    scale: int = Query(1, ge=1, le=3, description="pixel scale factor (crispness)"),
) -> Response:
    """A page-image (PNG) preview of the cover letter, rendered from its text.
    404s if there's no readable text to render."""
    cl = get_cover_letter(cover_letter_id, user, state)  # 404s if not owned
    png = render_text_preview(
        cl.content or "",
        title=cl.original_filename or "Cover letter",
        scale=scale,
    )
    if png is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no preview available (no readable text)")
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/cover-letters/{cover_letter_id}/structured", response_model=CoverLetterData)
def cover_letter_structured(
    cover_letter_id: str, user: CurrentUser, state: StateDep
) -> CoverLetterData:
    """The cover letter parsed into the structured template shape (name, contact, date,
    company, role, salutation, paragraphs, closing, signature)."""
    cl = get_cover_letter(cover_letter_id, user, state)
    return state.resume_assistant.structure_cover_letter(cl)


@router.post("/cover-letters/{cover_letter_id}/improve-structured",
             response_model=CoverLetterStructuredImprovement)
def improve_cover_letter_structured(
    cover_letter_id: str, body: ResumeReviseRequest, user: CurrentUser, state: StateDep
) -> CoverLetterStructuredImprovement:
    """AI-improve the cover letter and return it as the structured template shape (so
    improvements keep the template's formatting), plus the markdown to save and any
    possibly-invented numbers. Accept by POSTing the markdown to ``.../versions``."""
    from jobsearch.models.cover_letter_schema import cover_letter_data_to_markdown
    from jobsearch.models.resume_schema import new_number_flags

    cl = get_cover_letter(cover_letter_id, user, state)
    job_id = body.job_posting_id or cl.job_posting_id
    job = _require_job(state, job_id) if job_id else None
    focus = _combine_instructions(body.instruction, body.instructions)
    improved = state.resume_assistant.improve_cover_letter_structured(cl, instruction=focus, job=job)
    items = [(f"paragraphs[{i}]", p) for i, p in enumerate(improved.paragraphs)]
    return CoverLetterStructuredImprovement(
        structured=improved,
        markdown=cover_letter_data_to_markdown(improved),
        flagged_metrics=new_number_flags(cl.content or "", items),
    )


@router.get("/cover-letters/{cover_letter_id}/preview.html", response_class=HTMLResponse)
def cover_letter_preview_html(
    cover_letter_id: str, user: CurrentUser, state: StateDep
) -> HTMLResponse:
    """A reflowable, zoomable HTML preview of the cover letter (active version)."""
    cl = get_cover_letter(cover_letter_id, user, state)
    doc = render_text_html(cl.content or "", title=cl.original_filename or "Cover letter")
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no preview available (no readable text)")
    return HTMLResponse(content=doc, headers={"Cache-Control": "private, max-age=300"})


@router.get("/cover-letters/{cover_letter_id}", response_model=CoverLetter)
def get_cover_letter(cover_letter_id: str, user: CurrentUser, state: StateDep) -> CoverLetter:
    cl = state.cover_letters.get(cover_letter_id)
    if cl is None or cl.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cover letter not found")
    return ensure_cover_letter_grade(state, cl)


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
    review = state.resume_assistant.review_cover_letter(cl, job=job)
    # Refresh the cached card grade only from a general (no-job) review.
    if job is None and (cl.quality_grade != review.grade or cl.quality_score != review.score):
        cl.quality_score = review.score
        cl.quality_grade = review.grade
        state.cover_letters.add(cl)
    return review


@router.post("/cover-letters/{cover_letter_id}/tailor", response_model=CoverLetterTailoring)
def tailor_cover_letter(
    cover_letter_id: str, body: TailorRequest, user: CurrentUser, state: StateDep
) -> CoverLetterTailoring:
    """Cover-letter-for-a-job view: echoes the target job, scores how well the letter
    targets it, gives a perspective on how it fits, and lists concrete changes to
    tailor it. Read-only — the user then revises with this job id."""
    cl = get_cover_letter(cover_letter_id, user, state)
    job = _require_job(state, body.job_posting_id)
    low = (cl.content or "").lower()
    addressed = [r for r in job.requirements if r and r.lower() in low]
    missing = [r for r in job.requirements if r and r.lower() not in low]
    review = state.resume_assistant.review_cover_letter(cl, job=job)
    qualifications = state.resume_assistant.cl_qualifications(
        cl, job, fit_score=review.score, addressed=addressed, missing=missing,
    )
    return CoverLetterTailoring(
        cover_letter_id=cl.id,
        job=JobCard.from_job(job),
        fit_score=review.score,
        addressed=addressed,
        missing_points=missing,
        qualifications=qualifications,
        summary=review.summary,
        tailoring=review.suggestions,
    )


@router.post("/cover-letters/{cover_letter_id}/versions", response_model=CoverLetter)
def create_cover_letter_version(
    cover_letter_id: str, body: CreateVersionRequest, user: CurrentUser, state: StateDep
) -> CoverLetter:
    """Save an accepted rewrite as a new version, make it active, and record what
    changed. Returns the cover letter with its version history."""
    if not (body.content or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "content is required")
    cl = get_cover_letter(cover_letter_id, user, state)
    job = _require_job(state, body.job_posting_id) if body.job_posting_id else None
    _add_version(cl, text_attr="content", new_content=body.content, label=body.label,
                 source=("tailored" if job else "revision"), instruction=body.instruction,
                 job=job, state=state)
    cl.quality_score = None
    cl.quality_grade = ""
    state.cover_letters.add(cl)
    return ensure_cover_letter_grade(state, cl)


@router.post("/cover-letters/{cover_letter_id}/versions/{version}/activate", response_model=CoverLetter)
def activate_cover_letter_version(
    cover_letter_id: str, version: int, user: CurrentUser, state: StateDep
) -> CoverLetter:
    """Switch the active version — the document view/preview follow."""
    cl = get_cover_letter(cover_letter_id, user, state)
    ver = next((v for v in cl.versions if v.version == version), None)
    if ver is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "version not found")
    cl.active_version = version
    cl.content = ver.content
    cl.quality_score = None
    cl.quality_grade = ""
    state.cover_letters.add(cl)
    return ensure_cover_letter_grade(state, cl)


@router.get("/cover-letters/{cover_letter_id}/reuse", response_model=VersionReuseSuggestion)
def suggest_cover_letter_reuse(
    cover_letter_id: str, user: CurrentUser, state: StateDep,
    job_posting_id: str = Query(..., description="the new job to check saved versions against"),
) -> VersionReuseSuggestion:
    """Suggest reusing a previously-tailored cover-letter version for a new job."""
    cl = get_cover_letter(cover_letter_id, user, state)
    job = _require_job(state, job_posting_id)
    return _reuse_suggestion(cl.versions, job)


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
        return state.resume_assistant.revise_cover_letter(
            cl, _combine_instructions(body.instruction, body.instructions), job=job
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
