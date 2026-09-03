"""Screener-answer memory — auto-fill recurring application questions.

Powers the auto-apply flow: `suggest` pre-fills a form's questions from what the
user has answered before; `learn` (single or batch) saves answers as new
questions arise, so the next application asks less.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    ScreenerAnswerIn,
    ScreenerAnswerUpdate,
    ScreenerLearnBatch,
    ScreenerSuggestRequest,
)
from jobsearch.models import ScreenerAnswer

router = APIRouter(prefix="/api/v1/auto-apply/screener", tags=["auto-apply"])


@router.get("/answers", response_model=list[ScreenerAnswer])
def list_answers(user: CurrentUser, state: StateDep) -> list[ScreenerAnswer]:
    """Every saved screener answer for the user (newest first)."""
    return state.screener.list_for(user.id)


@router.post("/answers", response_model=ScreenerAnswer, status_code=status.HTTP_201_CREATED)
def learn_answer(body: ScreenerAnswerIn, user: CurrentUser, state: StateDep) -> ScreenerAnswer:
    """Save (or update) one answer. Upserts by the normalized question."""
    try:
        return state.screener.learn(user.id, body.question, body.answer, kind=body.kind)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.post("/answers/batch", response_model=list[ScreenerAnswer])
def learn_batch(body: ScreenerLearnBatch, user: CurrentUser, state: StateDep) -> list[ScreenerAnswer]:
    """Save a batch of answers — e.g. everything the user filled on a form."""
    return state.screener.learn_many(
        user.id, [a.model_dump() for a in body.answers]
    )


@router.post("/suggest")
def suggest(body: ScreenerSuggestRequest, user: CurrentUser, state: StateDep) -> dict:
    """Pre-fill a form: for each question return the saved answer (with a match
    confidence) or ``answer: null`` when it's new and needs the user. ``unknown``
    lists the questions with no saved answer."""
    rows = state.screener.suggest_many(user.id, body.questions)
    unknown = [r["question"] for r in rows if r.get("answer") is None]
    return {"answers": rows, "unknown": unknown, "filled": len(rows) - len(unknown)}


@router.put("/answers/{answer_id}", response_model=ScreenerAnswer)
def update_answer(
    answer_id: str, body: ScreenerAnswerUpdate, user: CurrentUser, state: StateDep
) -> ScreenerAnswer:
    item = state.screener.get_owned(answer_id, user.id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "screener answer not found")
    return state.screener.update(item, answer=body.answer, kind=body.kind)


@router.delete("/answers/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_answer(answer_id: str, user: CurrentUser, state: StateDep) -> None:
    item = state.screener.get_owned(answer_id, user.id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "screener answer not found")
    state.screener.delete(item.id)
