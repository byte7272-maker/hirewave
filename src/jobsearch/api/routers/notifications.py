"""§5.6 Notifications."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models import Notification

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[Notification])
def list_notifications(
    user: CurrentUser, state: StateDep, unread_only: bool = False
) -> list[Notification]:
    notes = state.notifications.find(user_id=user.id)
    if unread_only:
        notes = [n for n in notes if not n.is_read]
    return sorted(notes, key=lambda n: n.created_at, reverse=True)


@router.put("/read-all")
def mark_all_read(user: CurrentUser, state: StateDep) -> dict:
    count = 0
    for note in state.notifications.find(user_id=user.id):
        if not note.is_read:
            note.is_read = True
            state.notifications.add(note)  # persist the mutation
            count += 1
    return {"marked_read": count}


@router.put("/{notification_id}/read", response_model=Notification)
def mark_read(notification_id: str, user: CurrentUser, state: StateDep) -> Notification:
    note = state.notifications.get(notification_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "notification not found")
    note.is_read = True
    return state.notifications.add(note)  # persist the mutation
