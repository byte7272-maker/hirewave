"""InboxEngine — receive job-alert emails forwarded to a user's account.

Each user has a personal forwarding address ``jobs+<token>@<domain>``. An
inbound-email provider POSTs received mail to the inbox webhook, which routes by
that token, files the email in the user's in-app inbox, and runs any job links
through the aggregator's ingest pipeline.
"""

from __future__ import annotations

import re
import secrets
from typing import Callable, Optional

from jobsearch.engines.sourcing import parse_job_alert
from jobsearch.engines.sourcing.aggregator import AggregationResult, JobAggregator
from jobsearch.models import (
    InboxMessage,
    Notification,
    NotificationType,
    User,
)
from jobsearch.store import InMemoryRepository, Repository


class InboxEngine:
    def __init__(
        self,
        *,
        users: Repository[User],
        messages: Optional[Repository[InboxMessage]] = None,
        aggregator: JobAggregator,
        notifier: Optional[Callable[[Notification], None]] = None,
        domain: str = "inbox.hirewave.test",
    ) -> None:
        self.users = users
        self.messages = messages or InMemoryRepository(id_attr="id")
        self.aggregator = aggregator
        self._notifier = notifier or (lambda n: None)
        self.domain = domain

    # -- address / routing --------------------------------------------------
    def address_for(self, user: User) -> str:
        if not user.inbox_token:
            user.inbox_token = secrets.token_hex(8)
            self.users.add(user)
        return f"jobs+{user.inbox_token}@{self.domain}"

    def user_for_token(self, token: str) -> Optional[User]:
        found = self.users.find(inbox_token=token) if token else []
        return found[0] if found else None

    def user_for_address(self, address: str) -> Optional[User]:
        m = re.search(r"\+([0-9a-fA-F]+)@", address or "")
        return self.user_for_token(m.group(1)) if m else None

    # -- receiving ----------------------------------------------------------
    def receive(self, user_id: str, raw: bytes | str) -> tuple[InboxMessage, AggregationResult]:
        alert = parse_job_alert(raw)
        result = self.aggregator.ingest(
            alert.postings, sources={alert.source} if alert.source else None
        )
        titles = ", ".join(p["title"] for p in alert.postings[:3])
        msg = InboxMessage(
            user_id=user_id,
            source=alert.source,
            sender=alert.sender,
            subject=alert.subject or "(no subject)",
            snippet=titles or "No job links found in this email.",
            job_ids=result.job_ids,
            ingested=result.ingested,
        )
        self.messages.add(msg)
        visible = result.ingested - result.hidden
        if visible > 0:
            self._notifier(Notification(
                user_id=user_id,
                type=NotificationType.MATCH_FOUND,
                message=f"{visible} new role(s) from a forwarded {alert.source} alert",
            ))
        return msg, result

    def sync(self, user_id: str, raws: list[bytes | str]) -> tuple[list[InboxMessage], int]:
        """Receive a batch of raw emails (e.g. pulled from Gmail). Returns the
        stored messages and the total number of new roles ingested."""
        msgs: list[InboxMessage] = []
        total = 0
        for raw in raws:
            msg, result = self.receive(user_id, raw)
            msgs.append(msg)
            total += result.ingested - result.hidden
        return msgs, total

    # -- read ---------------------------------------------------------------
    def list(self, user_id: str) -> list[InboxMessage]:
        return sorted(self.messages.find(user_id=user_id), key=lambda m: m.received_at, reverse=True)

    def get(self, message_id: str, user_id: str) -> Optional[InboxMessage]:
        m = self.messages.get(message_id)
        return m if m and m.user_id == user_id else None

    def mark_read(self, message_id: str, user_id: str) -> Optional[InboxMessage]:
        m = self.get(message_id, user_id)
        if m is None:
            return None
        m.is_read = True
        return self.messages.add(m)

    def delete(self, message_id: str, user_id: str) -> bool:
        if self.get(message_id, user_id) is None:
            return False
        return self.messages.delete(message_id)

    def unread_count(self, user_id: str) -> int:
        return sum(1 for m in self.messages.find(user_id=user_id) if not m.is_read)
