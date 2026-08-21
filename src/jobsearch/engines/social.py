"""SocialEngine — invite → connect → direct-message & share jobs between users.

Invites are share codes (no outbound email needed): a user creates an invite,
passes the code/link to someone, and that person redeems it to connect. Only
connected users can message each other or share job postings.
"""

from __future__ import annotations

import secrets
from typing import Callable, Optional

from jobsearch.models import (
    Connection,
    DirectMessage,
    Invite,
    InviteStatus,
    Notification,
    NotificationType,
    User,
    pair_key,
)
from jobsearch.store import InMemoryRepository, Repository


class SocialEngine:
    def __init__(
        self,
        *,
        invites: Optional[Repository[Invite]] = None,
        connections: Optional[Repository[Connection]] = None,
        messages: Optional[Repository[DirectMessage]] = None,
        users: Repository[User],
        notifier: Optional[Callable[[Notification], None]] = None,
        email_sender=None,
        base_url: str = "http://localhost:3000",
    ) -> None:
        self.invites = invites or InMemoryRepository(id_attr="id")
        self.connections = connections or InMemoryRepository(id_attr="id")
        self.messages = messages or InMemoryRepository(id_attr="id")
        self.users = users
        self._notifier = notifier or (lambda n: None)
        self.email_sender = email_sender
        self.base_url = base_url

    # -- invites ------------------------------------------------------------
    def create_invite(self, user_id: str) -> Invite:
        return self.invites.add(Invite(from_user_id=user_id, code=secrets.token_urlsafe(6)))

    def invite_link(self, code: str) -> str:
        return f"{self.base_url}/dashboard/messages?invite={code}"

    def invite_by_email(self, user_id: str, email: str) -> tuple[Invite, str, bool]:
        """Create an invite and email it. Returns (invite, link, actually_sent)."""
        if "@" not in email:
            raise ValueError("a valid email is required")
        inv = self.create_invite(user_id)
        link = self.invite_link(inv.code)
        name = self._name(user_id)
        sent = False
        if self.email_sender is not None:
            sent = self.email_sender.send(
                to=email.strip(),
                subject=f"{name} invited you to connect on Hirewave",
                body=(f"{name} wants to connect with you on Hirewave.\n\n"
                      f"Join here: {link}\n\nOr enter this code in Messages: {inv.code}"),
            ) and self.email_sender.live
        return inv, link, sent

    def sent_invites(self, user_id: str) -> list[Invite]:
        return sorted(self.invites.find(from_user_id=user_id), key=lambda i: i.created_at, reverse=True)

    def accept_invite(self, code: str, user_id: str) -> Connection:
        found = self.invites.find(code=code)
        inv = found[0] if found else None
        if inv is None:
            raise ValueError("invalid invite code")
        if inv.from_user_id == user_id:
            raise ValueError("you can't accept your own invite")
        if inv.status == InviteStatus.PENDING:
            inv.status = InviteStatus.ACCEPTED
            inv.accepted_by = user_id
            self.invites.add(inv)
        conn = self._ensure_connection(inv.from_user_id, user_id)
        self._notifier(Notification(
            user_id=inv.from_user_id, type=NotificationType.SYSTEM,
            message=f"{self._name(user_id)} accepted your invite — you're connected.",
        ))
        return conn

    # -- connections --------------------------------------------------------
    def _ensure_connection(self, a: str, b: str) -> Connection:
        key = pair_key(a, b)
        found = self.connections.find(key=key)
        if found:
            return found[0]
        return self.connections.add(Connection(user_a=a, user_b=b, key=key))

    def are_connected(self, a: str, b: str) -> bool:
        return bool(self.connections.find(key=pair_key(a, b)))

    def connection_ids(self, user_id: str) -> list[str]:
        out = []
        for c in self.connections.all():
            if c.user_a == user_id:
                out.append(c.user_b)
            elif c.user_b == user_id:
                out.append(c.user_a)
        return out

    def connections_for(self, user_id: str) -> list[User]:
        return [u for u in (self.users.get(i) for i in self.connection_ids(user_id)) if u]

    # -- messaging ----------------------------------------------------------
    def send_message(self, from_id: str, to_id: str, *, body: str = "", shared_job_id: Optional[str] = None) -> DirectMessage:
        if from_id == to_id:
            raise ValueError("cannot message yourself")
        if not self.are_connected(from_id, to_id):
            raise ValueError("you can only message your connections")
        if not body.strip() and not shared_job_id:
            raise ValueError("message is empty")
        msg = DirectMessage(
            thread_key=pair_key(from_id, to_id),
            from_user_id=from_id, to_user_id=to_id,
            body=body.strip(), shared_job_id=shared_job_id,
        )
        self.messages.add(msg)
        self._notifier(Notification(
            user_id=to_id, type=NotificationType.SYSTEM,
            message=f"New message from {self._name(from_id)}"
            + (" (shared a job)" if shared_job_id else ""),
        ))
        return msg

    def conversation(self, user_id: str, other_id: str) -> list[DirectMessage]:
        key = pair_key(user_id, other_id)
        msgs = sorted(self.messages.find(thread_key=key), key=lambda m: m.created_at)
        for m in msgs:  # mark the ones addressed to me as read
            if m.to_user_id == user_id and not m.is_read:
                m.is_read = True
                self.messages.add(m)
        return msgs

    def threads(self, user_id: str) -> list[dict]:
        out = []
        for other in self.connections_for(user_id):
            key = pair_key(user_id, other.id)
            msgs = sorted(self.messages.find(thread_key=key), key=lambda m: m.created_at)
            last = msgs[-1] if msgs else None
            unread = sum(1 for m in msgs if m.to_user_id == user_id and not m.is_read)
            out.append({
                "user_id": other.id,
                "name": other.full_name or other.email,
                "last_message": last.body if last else "",
                "last_at": last.created_at.isoformat() if last else None,
                "unread": unread,
            })
        out.sort(key=lambda t: (t["last_at"] or ""), reverse=True)
        return out

    def unread_count(self, user_id: str) -> int:
        return sum(1 for m in self.messages.all() if m.to_user_id == user_id and not m.is_read)

    # -- helpers ------------------------------------------------------------
    def _name(self, user_id: str) -> str:
        u = self.users.get(user_id)
        return (u.full_name or u.email) if u else "Someone"
