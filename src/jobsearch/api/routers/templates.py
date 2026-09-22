"""Résumé templates — built-in presets + the user's own AI-generated/saved styles.

A template is a *style config* the frontend renders JSON Resume data into. The user
can generate one from a description, tweak it, and save it to reuse across résumés.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models import BUILTIN_TEMPLATES, ResumeTemplate, ResumeTemplateStyle

router = APIRouter(prefix="/api/v1/resume-templates", tags=["resume-templates"])


class GenerateTemplateRequest(BaseModel):
    prompt: str  # e.g. "clean two-column tech résumé, teal accent, modern sans-serif"
    name: str = ""


class SaveTemplateRequest(BaseModel):
    name: str
    description: str = ""
    style: ResumeTemplateStyle
    source: str = "custom"  # "custom" | "generated"


@router.get("", response_model=list[ResumeTemplate])
def list_templates(user: CurrentUser, state: StateDep) -> list[ResumeTemplate]:
    """The built-in presets followed by the user's own saved templates."""
    own = sorted(state.resume_templates.find(user_id=user.id),
                 key=lambda t: t.created_at, reverse=True)
    return [*BUILTIN_TEMPLATES, *own]


@router.post("/generate", response_model=ResumeTemplate)
def generate_template(
    body: GenerateTemplateRequest, user: CurrentUser, state: StateDep
) -> ResumeTemplate:
    """Generate a template style from a description. Returns a preview (not saved) —
    POST it to ``/resume-templates`` to keep it."""
    if not body.prompt.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a style description is required")
    style = state.resume_assistant.generate_template_style(body.prompt)
    return ResumeTemplate(
        user_id=user.id, name=body.name or "Generated style",
        description=body.prompt.strip()[:200], source="generated", style=style,
    )


@router.post("", response_model=ResumeTemplate, status_code=status.HTTP_201_CREATED)
def save_template(
    body: SaveTemplateRequest, user: CurrentUser, state: StateDep
) -> ResumeTemplate:
    """Save a template (a generated or hand-tweaked style) for reuse."""
    if not body.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a name is required")
    tpl = ResumeTemplate(
        user_id=user.id, name=body.name.strip(), description=body.description.strip(),
        source=body.source if body.source in ("custom", "generated") else "custom",
        style=body.style,
    )
    return state.resume_templates.add(tpl)


@router.get("/{template_id}", response_model=ResumeTemplate)
def get_template(template_id: str, user: CurrentUser, state: StateDep) -> ResumeTemplate:
    for t in BUILTIN_TEMPLATES:
        if t.id == template_id:
            return t
    tpl = state.resume_templates.get(template_id)
    if tpl is None or tpl.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    return tpl


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, user: CurrentUser, state: StateDep) -> None:
    tpl = state.resume_templates.get(template_id)
    if tpl is None or tpl.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    state.resume_templates.delete(template_id)
