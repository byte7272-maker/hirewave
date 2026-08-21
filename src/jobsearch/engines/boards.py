"""BoardsEngine — shared message boards / groups (post + share jobs)."""

from __future__ import annotations

import secrets
from typing import Callable, Optional

from jobsearch.models import (
    Board,
    BoardMember,
    BoardPost,
    JobPosting,
    Notification,
    User,
    member_key,
)
from jobsearch.store import InMemoryRepository, Repository


class BoardsEngine:
    def __init__(
        self,
        *,
        boards: Optional[Repository[Board]] = None,
        members: Optional[Repository[BoardMember]] = None,
        posts: Optional[Repository[BoardPost]] = None,
        users: Repository[User],
        jobs: Repository[JobPosting],
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.boards = boards or InMemoryRepository(id_attr="id")
        self.members = members or InMemoryRepository(id_attr="id")
        self.posts = posts or InMemoryRepository(id_attr="id")
        self.users = users
        self.jobs = jobs
        self._notifier = notifier or (lambda n: None)

    # -- membership ---------------------------------------------------------
    def is_member(self, board_id: str, user_id: str) -> bool:
        return bool(self.members.find(key=member_key(board_id, user_id)))

    def _add_member(self, board: Board, user_id: str) -> None:
        if not self.is_member(board.id, user_id):
            self.members.add(BoardMember(board_id=board.id, user_id=user_id, key=member_key(board.id, user_id)))
            board.member_count = len(self.members.find(board_id=board.id))
            self.boards.add(board)

    # -- CRUD ---------------------------------------------------------------
    def create(self, owner_id: str, *, name: str, description: str = "", is_public: bool = True) -> Board:
        if not name.strip():
            raise ValueError("board name is required")
        board = Board(name=name.strip(), description=description.strip(), owner_id=owner_id,
                      is_public=is_public, join_code=secrets.token_urlsafe(6), member_count=0)
        self.boards.add(board)
        self._add_member(board, owner_id)
        return board

    def join(self, user_id: str, *, board_id: Optional[str] = None, code: str = "") -> Board:
        board: Optional[Board] = None
        if code:
            found = self.boards.find(join_code=code)
            board = found[0] if found else None
        elif board_id:
            board = self.boards.get(board_id)
        if board is None:
            raise ValueError("board not found")
        if not board.is_public and board.join_code != code:
            raise ValueError("this board is private — you need its invite code")
        self._add_member(board, user_id)
        return board

    def leave(self, board_id: str, user_id: str) -> bool:
        found = self.members.find(key=member_key(board_id, user_id))
        if not found:
            return False
        self.members.delete(found[0].id)
        board = self.boards.get(board_id)
        if board:
            board.member_count = len(self.members.find(board_id=board_id))
            self.boards.add(board)
        return True

    # -- read ---------------------------------------------------------------
    def my_boards(self, user_id: str) -> list[Board]:
        ids = [m.board_id for m in self.members.find(user_id=user_id)]
        boards = [self.boards.get(i) for i in ids]
        return sorted([b for b in boards if b], key=lambda b: b.created_at, reverse=True)

    def discover(self, user_id: str, limit: int = 30) -> list[Board]:
        joined = {m.board_id for m in self.members.find(user_id=user_id)}
        out = [b for b in self.boards.all() if b.is_public and b.id not in joined]
        out.sort(key=lambda b: b.member_count, reverse=True)
        return out[: max(1, limit)]

    def get(self, board_id: str, user_id: str) -> Optional[Board]:
        board = self.boards.get(board_id)
        if board is None:
            return None
        if board.is_public or self.is_member(board_id, user_id):
            return board
        return None

    def members_of(self, board_id: str) -> list[User]:
        ids = [m.user_id for m in self.members.find(board_id=board_id)]
        return [u for u in (self.users.get(i) for i in ids) if u]

    # -- posts --------------------------------------------------------------
    def post(self, user_id: str, board_id: str, *, body: str = "", shared_job_id: Optional[str] = None) -> BoardPost:
        if not self.is_member(board_id, user_id):
            raise ValueError("join the board to post")
        if not body.strip() and not shared_job_id:
            raise ValueError("post is empty")
        post = BoardPost(board_id=board_id, user_id=user_id, body=body.strip(), shared_job_id=shared_job_id)
        self.posts.add(post)
        return post

    def posts_for(self, board_id: str, user_id: str, limit: int = 100) -> Optional[list[BoardPost]]:
        if self.get(board_id, user_id) is None:
            return None
        rows = sorted(self.posts.find(board_id=board_id), key=lambda p: p.created_at)
        return rows[-limit:]
