"""Message boards / groups — shared channels where members post and share jobs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    BoardCreate,
    BoardOut,
    BoardPostCreate,
    BoardPostOut,
    ConnectionBrief,
    JoinBoardRequest,
    SharedJobBrief,
)
from jobsearch.models import Board, BoardPost

router = APIRouter(prefix="/api/v1/boards", tags=["boards"])


def _board_out(state: StateDep, b: Board, user_id: str) -> BoardOut:
    joined = state.boards.is_member(b.id, user_id)
    is_owner = b.owner_id == user_id
    return BoardOut(
        id=b.id, name=b.name, description=b.description, owner_id=b.owner_id,
        is_public=b.is_public, member_count=b.member_count, created_at=b.created_at.isoformat(),
        joined=joined, is_owner=is_owner, join_code=b.join_code if (joined or is_owner) else None,
    )


def _post_out(state: StateDep, p: BoardPost, user_id: str) -> BoardPostOut:
    author = state.users.get(p.user_id)
    shared = None
    if p.shared_job_id:
        job = state.jobs.get(p.shared_job_id)
        if job is not None:
            shared = SharedJobBrief(id=job.id, title=job.title, company=job.company)
    return BoardPostOut(
        id=p.id, user_id=p.user_id, author=(author.full_name or author.email) if author else "Unknown",
        body=p.body, shared_job=shared, mine=p.user_id == user_id, created_at=p.created_at.isoformat(),
    )


@router.get("", response_model=list[BoardOut])
def my_boards(user: CurrentUser, state: StateDep) -> list[BoardOut]:
    return [_board_out(state, b, user.id) for b in state.boards.my_boards(user.id)]


@router.get("/discover", response_model=list[BoardOut])
def discover(user: CurrentUser, state: StateDep) -> list[BoardOut]:
    return [_board_out(state, b, user.id) for b in state.boards.discover(user.id)]


@router.post("", response_model=BoardOut, status_code=status.HTTP_201_CREATED)
def create_board(body: BoardCreate, user: CurrentUser, state: StateDep) -> BoardOut:
    try:
        b = state.boards.create(user.id, name=body.name, description=body.description, is_public=body.is_public)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _board_out(state, b, user.id)


@router.post("/join", response_model=BoardOut)
def join_board(body: JoinBoardRequest, user: CurrentUser, state: StateDep) -> BoardOut:
    try:
        b = state.boards.join(user.id, board_id=body.board_id, code=(body.code or "").strip())
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _board_out(state, b, user.id)


@router.get("/{board_id}", response_model=BoardOut)
def get_board(board_id: str, user: CurrentUser, state: StateDep) -> BoardOut:
    b = state.boards.get(board_id, user.id)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "board not found")
    return _board_out(state, b, user.id)


@router.delete("/{board_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_board(board_id: str, user: CurrentUser, state: StateDep) -> None:
    if not state.boards.leave(board_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not a member")


@router.get("/{board_id}/members", response_model=list[ConnectionBrief])
def members(board_id: str, user: CurrentUser, state: StateDep) -> list[ConnectionBrief]:
    if state.boards.get(board_id, user.id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "board not found")
    return [ConnectionBrief(user_id=u.id, name=u.full_name or u.email) for u in state.boards.members_of(board_id)]


@router.get("/{board_id}/posts", response_model=list[BoardPostOut])
def list_posts(board_id: str, user: CurrentUser, state: StateDep) -> list[BoardPostOut]:
    posts = state.boards.posts_for(board_id, user.id)
    if posts is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "board not found")
    return [_post_out(state, p, user.id) for p in posts]


@router.post("/{board_id}/posts", response_model=BoardPostOut, status_code=status.HTTP_201_CREATED)
def create_post(board_id: str, body: BoardPostCreate, user: CurrentUser, state: StateDep) -> BoardPostOut:
    if body.shared_job_id and state.jobs.get(body.shared_job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "shared job not found")
    try:
        p = state.boards.post(user.id, board_id, body=body.body, shared_job_id=body.shared_job_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _post_out(state, p, user.id)
