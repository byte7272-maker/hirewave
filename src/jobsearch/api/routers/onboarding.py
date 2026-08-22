"""Beginner 'Getting Started' onboarding — drives the wizard hub.

Each step's `done` status is *derived* from the user's real data (do they have a
résumé, a saved search, an application, a mock interview?) so the checklist is
accurate without the client reporting anything. A small stored record only holds
explicit overrides — steps the user marked done/skipped, and whether they
dismissed the hub.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import OnboardingHubUpdate, OnboardingStepUpdate
from jobsearch.models import OnboardingProgress
from jobsearch.models.common import utcnow

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

# Ordered steps. The "core 4" beginner path is flagged core=True; the rest are
# surfaced after the essentials are done. Copy/UX lives on the client.
_STEPS = [
    ("profile", True),
    ("find_jobs", True),
    ("apply", True),
    ("interview", True),
    ("highlights", False),
    ("auto_apply", False),
    ("security", False),
]
_VALID_STEPS = {k for k, _ in _STEPS}
_VALID_STATUS = {"completed", "dismissed", "started"}


def _detect(state, user_id: str) -> dict[str, bool]:
    """Auto-detected completion per step from the user's real data."""
    profile = state.profiles.get(user_id)
    profile_ready = bool(state.resumes.find(user_id=user_id)) or bool(
        profile and (profile.headline or profile.skills)
    )
    searched = bool(state.saved_searches_repo.find(user_id=user_id)) or bool(
        state.applications.find(user_id=user_id)
    )
    return {
        "profile": profile_ready,
        "find_jobs": searched,
        "apply": bool(state.applications.find(user_id=user_id)),
        "interview": bool(state.mock_interviews.find(user_id=user_id)),
        "highlights": bool(state.experience.list_for(user_id)),
        "auto_apply": bool(state.auto_apply_grants.find(user_id=user_id)),
        "security": bool(state.monitored_identifiers.find(user_id=user_id)),
    }


def _record(state, user_id: str) -> OnboardingProgress:
    return state.onboarding.get(user_id) or OnboardingProgress(user_id=user_id)


def _view(state, user_id: str) -> dict:
    detected = _detect(state, user_id)
    rec = _record(state, user_id)
    steps = []
    core_total = core_done = 0
    for key, core in _STEPS:
        marked = rec.marks.get(key)
        done = detected[key] or marked == "completed"
        steps.append(
            {
                "key": key,
                "core": core,
                "done": done,
                "detected": detected[key],
                "marked": marked,  # "completed" | "dismissed" | "started" | None
            }
        )
        if core:
            core_total += 1
            core_done += 1 if done else 0
    percent = round(core_done / core_total * 100) if core_total else 0
    return {
        "dismissed": rec.dismissed,
        "core_total": core_total,
        "core_completed": core_done,
        "percent": percent,
        "steps": steps,
    }


@router.get("")
def get_onboarding(user: CurrentUser, state: StateDep) -> dict:
    """The Getting Started checklist — derived status merged with saved marks."""
    return _view(state, user.id)


@router.put("")
def update_hub(body: OnboardingHubUpdate, user: CurrentUser, state: StateDep) -> dict:
    """Dismiss (or restore) the whole Getting Started hub."""
    rec = _record(state, user.id)
    rec.dismissed = body.dismissed
    rec.updated_at = utcnow()
    state.onboarding.add(rec)
    return _view(state, user.id)


@router.put("/{step}")
def update_step(
    step: str, body: OnboardingStepUpdate, user: CurrentUser, state: StateDep
) -> dict:
    """Mark a step completed / dismissed / started (overrides auto-detection)."""
    if step not in _VALID_STEPS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown onboarding step")
    if body.status not in _VALID_STATUS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid status")
    rec = _record(state, user.id)
    rec.marks[step] = body.status
    rec.updated_at = utcnow()
    state.onboarding.add(rec)
    return _view(state, user.id)
