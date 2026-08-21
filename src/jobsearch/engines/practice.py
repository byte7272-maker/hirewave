"""PracticeEngine — peer practice interviews over WebRTC (REST signalling)."""

from __future__ import annotations

from typing import Callable, Optional

from jobsearch.models import (
    Notification,
    NotificationType,
    PracticeSession,
    PracticeSignal,
    PracticeStatus,
    UserProfile,
)
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository, Repository


class PracticeEngine:
    def __init__(
        self,
        *,
        sessions: Optional[Repository[PracticeSession]] = None,
        signals: Optional[Repository[PracticeSignal]] = None,
        social,
        users,
        interview,
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.sessions = sessions or InMemoryRepository(id_attr="id")
        self.signals = signals or InMemoryRepository(id_attr="id")
        self.social = social
        self.users = users
        self.interview = interview
        self._notifier = notifier or (lambda n: None)

    # -- lifecycle ----------------------------------------------------------
    def invite(self, host_id: str, guest_id: str) -> PracticeSession:
        if host_id == guest_id:
            raise ValueError("you can't practise with yourself")
        if not self.social.are_connected(host_id, guest_id):
            raise ValueError("you can only practise with your connections")
        session = self.sessions.add(PracticeSession(host_id=host_id, guest_id=guest_id))
        self._notifier(Notification(
            user_id=guest_id, type=NotificationType.SYSTEM,
            message=f"{self._name(host_id)} invited you to a practice interview.",
        ))
        return session

    def get(self, session_id: str, user_id: str) -> Optional[PracticeSession]:
        s = self.sessions.get(session_id)
        return s if s and user_id in (s.host_id, s.guest_id) else None

    def my_sessions(self, user_id: str) -> list[PracticeSession]:
        out = [s for s in self.sessions.all()
               if user_id in (s.host_id, s.guest_id) and s.status != PracticeStatus.ENDED]
        return sorted(out, key=lambda s: s.created_at, reverse=True)

    def accept(self, session_id: str, user_id: str) -> Optional[PracticeSession]:
        s = self.get(session_id, user_id)
        if s is None or s.status == PracticeStatus.ENDED:
            return None
        s.status = PracticeStatus.ACTIVE
        s.updated_at = utcnow()
        return self.sessions.add(s)

    def end(self, session_id: str, user_id: str) -> bool:
        s = self.get(session_id, user_id)
        if s is None:
            return False
        s.status = PracticeStatus.ENDED
        s.updated_at = utcnow()
        self.sessions.add(s)
        # let the other side know + clear the mailbox
        other = self._other(s, user_id)
        self.signals.add(PracticeSignal(session_id=session_id, to_user_id=other, from_user_id=user_id, kind="bye"))
        return True

    # -- signalling ---------------------------------------------------------
    def post_signal(self, session_id: str, from_id: str, kind: str, payload: str) -> Optional[PracticeSignal]:
        s = self.get(session_id, from_id)
        if s is None:
            return None
        return self.signals.add(PracticeSignal(
            session_id=session_id, to_user_id=self._other(s, from_id),
            from_user_id=from_id, kind=kind, payload=payload,
        ))

    def poll_signals(self, session_id: str, user_id: str) -> list[dict]:
        s = self.get(session_id, user_id)
        if s is None:
            return []
        mine = sorted(
            [m for m in self.signals.find(session_id=session_id) if m.to_user_id == user_id],
            key=lambda m: m.created_at,
        )
        out = [{"kind": m.kind, "payload": m.payload, "from": m.from_user_id} for m in mine]
        for m in mine:
            self.signals.delete(m.id)
        return out

    # -- shared content -----------------------------------------------------
    def questions(self, session_id: str) -> list[str]:
        """Generic interview questions both peers see (no persona)."""
        qs = self.interview._derive_questions(UserProfile(user_id="peer"), None)
        return [q.question for q in qs]

    # -- helpers ------------------------------------------------------------
    def _other(self, session: PracticeSession, user_id: str) -> str:
        return session.guest_id if session.host_id == user_id else session.host_id

    def _name(self, user_id: str) -> str:
        u = self.users.get(user_id)
        return (u.full_name or u.email) if u else "Someone"
