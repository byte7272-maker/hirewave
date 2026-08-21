"""§5.1 Users & preferences."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import PreferencesUpdate, ProfileUpdate, UserOut
from jobsearch.models import UserProfile
from jobsearch.models.common import utcnow
from jobsearch.models.user import JobPreferences

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _profile(state: StateDep, user_id: str) -> UserProfile:
    prof = state.profiles.get(user_id)
    if prof is None:
        prof = state.profiles.add(UserProfile(user_id=user_id))
    return prof


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser) -> UserOut:
    return UserOut(id=user.id, email=user.email, full_name=user.full_name, location=user.location)


@router.put("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: CurrentUser, state: StateDep) -> UserOut:
    prof = _profile(state, user.id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(prof, field, value)
    state.profiles.add(prof)  # persist the mutation
    user.updated_at = utcnow()
    state.users.add(user)
    return UserOut(id=user.id, email=user.email, full_name=user.full_name, location=user.location)


@router.get("/me/profile", response_model=UserProfile)
def get_profile(user: CurrentUser, state: StateDep) -> UserProfile:
    return _profile(state, user.id)


@router.get("/me/preferences", response_model=JobPreferences)
def get_preferences(user: CurrentUser, state: StateDep) -> JobPreferences:
    return _profile(state, user.id).preferences


@router.put("/me/preferences", response_model=JobPreferences)
def update_preferences(
    body: PreferencesUpdate, user: CurrentUser, state: StateDep
) -> JobPreferences:
    prof = _profile(state, user.id)
    prefs = prof.preferences
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(prefs, field, value)
    prof.preferences = prefs
    state.profiles.add(prof)  # persist the mutation
    return prof.preferences
