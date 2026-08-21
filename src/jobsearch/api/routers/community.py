"""Crowdsourced interview questions — submit, search by job title, upvote."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import CommunityQuestionOut, CommunityQuestionSubmit
from jobsearch.models import CommunityQuestion, QuestionCategory

router = APIRouter(prefix="/api/v1/questions", tags=["community-questions"])


def _out(q: CommunityQuestion, user_id: str) -> CommunityQuestionOut:
    return CommunityQuestionOut(
        id=q.id,
        job_title=q.job_title,
        category=q.category.value,
        question=q.question,
        tips=q.tips,
        votes=q.votes,
        created_at=q.created_at.isoformat(),
        mine=q.user_id == user_id,
        voted=user_id in q.voter_ids,
    )


def _category(value: str | None) -> QuestionCategory | None:
    if not value:
        return None
    try:
        return QuestionCategory(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown category '{value}'") from exc


@router.get("/search", response_model=list[CommunityQuestionOut])
def search_questions(
    user: CurrentUser,
    state: StateDep,
    job_title: str = Query("", description="job type / title to find questions for"),
    category: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> list[CommunityQuestionOut]:
    """Find crowdsourced questions relevant to a job type, best match first."""
    results = state.community.search(job_title, category=_category(category), limit=limit)
    return [_out(q, user.id) for q in results]


@router.get("/titles")
def popular_titles(user: CurrentUser, state: StateDep, limit: int = Query(50, ge=1, le=200)) -> list[dict]:
    """Job titles that already have questions (with counts) — for suggestions."""
    return state.community.titles(limit=limit)


@router.get("/mine", response_model=list[CommunityQuestionOut])
def my_questions(user: CurrentUser, state: StateDep) -> list[CommunityQuestionOut]:
    return [_out(q, user.id) for q in state.community.for_user(user.id)]


@router.post("", response_model=CommunityQuestionOut, status_code=status.HTTP_201_CREATED)
def submit_question(
    body: CommunityQuestionSubmit, user: CurrentUser, state: StateDep
) -> CommunityQuestionOut:
    """Contribute a question for a specific job title."""
    try:
        q = state.community.submit(
            user_id=user.id,
            job_title=body.job_title,
            question=body.question,
            category=_category(body.category) or QuestionCategory.BEHAVIORAL,
            tips=body.tips,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _out(q, user.id)


@router.post("/{question_id}/vote", response_model=CommunityQuestionOut)
def vote_question(question_id: str, user: CurrentUser, state: StateDep) -> CommunityQuestionOut:
    """Toggle a helpful upvote (one per user)."""
    q = state.community.vote(question_id, user.id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "question not found")
    return _out(q, user.id)


@router.post("/{question_id}/flag", response_model=CommunityQuestionOut)
def flag_question(question_id: str, user: CurrentUser, state: StateDep) -> CommunityQuestionOut:
    """Flag a question as inappropriate/low-quality (auto-hidden past a threshold)."""
    q = state.community.flag(question_id, user.id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "question not found")
    return _out(q, user.id)
