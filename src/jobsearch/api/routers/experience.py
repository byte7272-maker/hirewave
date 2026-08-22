"""External work-experience highlights.

A place for users to bring in narrative work material — highlights, STAR-style
stories, project write-ups, analyses — that's richer than a résumé's bullets.
The content is either self-written or produced by an AI agent inside the user's
*own* work environment (one with legitimate access to their work email, MS Teams,
or other work software that can surface past projects and results they'd
forgotten). The platform never touches those work tools or credentials itself:
the user brings the finished summary here and attests to it.

These highlights become extra grounding for interview prep (see the interview
router), so suggested answers can reference real work the candidate might not
have recalled.
"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import ExperienceCreate, ExperienceUpdate
from jobsearch.models import ExperienceHighlight
from jobsearch.textextract import extract_text

router = APIRouter(prefix="/api/v1/experience", tags=["experience"])


def _owned(item_id: str, user: CurrentUser, state: StateDep) -> ExperienceHighlight:
    item = state.experience.get_owned(item_id, user.id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "experience highlight not found")
    return item


@router.post("", response_model=ExperienceHighlight, status_code=status.HTTP_201_CREATED)
def create_highlight(
    body: ExperienceCreate, user: CurrentUser, state: StateDep
) -> ExperienceHighlight:
    """Add a self-written or AI-generated work highlight (pasted text)."""
    try:
        return state.experience.create(
            user.id,
            content=body.content,
            title=body.title,
            kind=body.kind,
            source=body.source,
            source_tool=body.source_tool,
            skills=body.skills,
            company=body.company,
            period=body.period,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/upload", response_model=ExperienceHighlight, status_code=status.HTTP_201_CREATED)
async def upload_highlight(
    user: CurrentUser,
    state: StateDep,
    file: UploadFile = File(...),
    title: str = Form(""),
    kind: str = Form("highlight"),
    source: str = Form("imported"),
    source_tool: str = Form(""),
    company: str = Form(""),
    period: str = Form(""),
) -> ExperienceHighlight:
    """Upload a file (PDF/DOCX/MD/TXT) of highlights — e.g. an export an AI agent
    in the user's work environment produced. The text is extracted and stored."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    filename = file.filename or "highlights"
    content_type = file.content_type or "application/octet-stream"
    text = extract_text(data, filename=filename, content_type=content_type).strip()
    if len(text) < 10:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "could not extract readable text from the file",
        )
    try:
        return state.experience.create(
            user.id,
            content=text,
            title=title or filename.rsplit(".", 1)[0],
            kind=kind,
            source=source,
            source_tool=source_tool,
            company=company,
            period=period,
            original_filename=filename,
            content_type=content_type,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.get("", response_model=list[ExperienceHighlight])
def list_highlights(user: CurrentUser, state: StateDep) -> list[ExperienceHighlight]:
    return state.experience.list_for(user.id)


@router.get("/{item_id}", response_model=ExperienceHighlight)
def get_highlight(item_id: str, user: CurrentUser, state: StateDep) -> ExperienceHighlight:
    return _owned(item_id, user, state)


@router.put("/{item_id}", response_model=ExperienceHighlight)
def update_highlight(
    item_id: str, body: ExperienceUpdate, user: CurrentUser, state: StateDep
) -> ExperienceHighlight:
    item = _owned(item_id, user, state)
    return state.experience.update(item, body.model_dump(exclude_unset=True))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(item_id: str, user: CurrentUser, state: StateDep) -> None:
    item = _owned(item_id, user, state)
    state.experience.delete(item.id)
