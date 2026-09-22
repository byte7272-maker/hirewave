"""Résumé templates — a SHARED library: 8 built-in defaults + templates any user
contributes, available to everyone, tracked by category (type). Users generate a
style from a description, save it to the library, and the renderer applies any
template to their JSON Resume data. Users can delete only templates they created.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models import (
    BUILTIN_TEMPLATES,
    TEMPLATE_CATEGORIES,
    ResumeTemplate,
    ResumeTemplateStyle,
)
from jobsearch.models.resume_template import validate_template

router = APIRouter(prefix="/api/v1/resume-templates", tags=["resume-templates"])


class GenerateTemplateRequest(BaseModel):
    prompt: str  # e.g. "clean two-column tech résumé, teal accent, modern sans-serif"
    name: str = ""
    category: str = ""  # optional; inferred from the prompt if blank


class SaveTemplateRequest(BaseModel):
    name: str
    description: str = ""
    category: str = "custom"
    style: ResumeTemplateStyle
    source: str = "custom"  # "custom" | "generated"


def _infer_category(text: str) -> str:
    low = (text or "").lower()
    for cat in TEMPLATE_CATEGORIES:
        if cat in low:
            return cat
    if "two-column" in low or "two column" in low:
        return "technical"
    return "custom"


@router.get("", response_model=list[ResumeTemplate])
def list_templates(
    user: CurrentUser, state: StateDep,
    category: Optional[str] = Query(None, description="filter by type/category"),
) -> list[ResumeTemplate]:
    """The shared library: 8 built-in defaults + APPROVED community templates, plus
    the requesting user's own templates (any status, so they can use them while
    pending). Newest contributions first. Optional ``category`` filter."""
    visible = [
        t for t in state.resume_templates.all()
        if (t.shared and t.status == "approved") or t.created_by == user.id
    ]
    visible.sort(key=lambda t: t.created_at, reverse=True)
    templates = [*BUILTIN_TEMPLATES, *visible]
    if category:
        templates = [t for t in templates if t.category == category]
    return templates


@router.get("/categories")
def list_categories(_user: CurrentUser) -> dict:
    return {"categories": TEMPLATE_CATEGORIES}


@router.post("/generate", response_model=ResumeTemplate)
def generate_template(
    body: GenerateTemplateRequest, user: CurrentUser, state: StateDep
) -> ResumeTemplate:
    """Generate a template style from a description (preview, not saved). POST it to
    ``/resume-templates`` to add it to the shared library."""
    if not body.prompt.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a style description is required")
    style = state.resume_assistant.generate_template_style(body.prompt)
    return ResumeTemplate(
        name=body.name or "Generated style",
        category=body.category or _infer_category(body.prompt),
        description=body.prompt.strip()[:200], source="generated",
        created_by=user.id, style=style,
    )


@router.post("", response_model=ResumeTemplate, status_code=status.HTTP_201_CREATED)
def save_template(
    body: SaveTemplateRequest, user: CurrentUser, state: StateDep
) -> ResumeTemplate:
    """Save a template. It passes the automated **quality gate** (valid, ATS-safe
    style + clean text) before it can be shared, then either goes public immediately
    (if auto-approve is on) or waits "pending" for an admin. The contributor can use
    and delete their own template regardless of status.

    Only the STYLE is stored — never any résumé content."""
    if not body.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a name is required")
    problems = validate_template(body.name, body.description, body.style)
    if problems:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(problems))
    category = body.category if body.category in TEMPLATE_CATEGORIES else _infer_category(
        f"{body.name} {body.description}")
    approved = state.settings.template_auto_approve
    tpl = ResumeTemplate(
        name=body.name.strip(), description=body.description.strip(), category=category,
        source=body.source if body.source in ("custom", "generated") else "custom",
        created_by=user.id, shared=True, status="approved" if approved else "pending",
        style=body.style,
    )
    return state.resume_templates.add(tpl)


@router.post("/{template_id}/flag", status_code=status.HTTP_204_NO_CONTENT)
def flag_template(template_id: str, user: CurrentUser, state: StateDep) -> None:
    """Report a community template. Past the flag threshold it auto-hides (back to
    "pending") for an admin to review. Built-in presets can't be flagged."""
    tpl = state.resume_templates.get(template_id)
    if tpl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    tpl.flags += 1
    if tpl.flags >= state.settings.template_flag_threshold and tpl.status == "approved":
        tpl.status = "pending"
    state.resume_templates.add(tpl)


def _find(state: StateDep, template_id: str) -> Optional[ResumeTemplate]:
    for t in BUILTIN_TEMPLATES:
        if t.id == template_id:
            return t
    return state.resume_templates.get(template_id)


@router.get("/{template_id}", response_model=ResumeTemplate)
def get_template(template_id: str, user: CurrentUser, state: StateDep) -> ResumeTemplate:
    tpl = _find(state, template_id)
    if tpl is None or not (tpl.status == "approved" or tpl.created_by == user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    return tpl


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, user: CurrentUser, state: StateDep) -> None:
    tpl = state.resume_templates.get(template_id)
    if tpl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    if tpl.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only delete templates you created")
    state.resume_templates.delete(template_id)
