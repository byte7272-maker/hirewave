"""SignupInviteEngine — mint, list, revoke, and redeem account-creation invites."""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional

from jobsearch.models import SignupInvite
from jobsearch.models.common import utcnow


class SignupInviteEngine:
    def __init__(self, repo) -> None:
        self.repo = repo

    def mint(
        self, *, label: str = "", max_uses: int = 1, ttl_hours: Optional[int] = None, count: int = 1
    ) -> list[SignupInvite]:
        """Create one or more invite codes."""
        out: list[SignupInvite] = []
        expires_at = utcnow() + timedelta(hours=ttl_hours) if ttl_hours else None
        for _ in range(max(1, min(count, 100))):
            inv = SignupInvite(
                code=secrets.token_urlsafe(9), label=label,
                max_uses=max(1, max_uses), expires_at=expires_at,
            )
            self.repo.add(inv)
            out.append(inv)
        return out

    def list(self) -> list[SignupInvite]:
        return sorted(self.repo.all(), key=lambda i: i.created_at, reverse=True)

    def revoke(self, invite_id: str) -> bool:
        inv = self.repo.get(invite_id)
        if inv is None:
            return False
        inv.active = False
        self.repo.add(inv)
        return True

    def redeem(self, code: str, *, email: str = "") -> bool:
        """Consume a valid managed invite matching ``code``. Returns True on success
        (a use is recorded); False if no valid invite matches."""
        code = (code or "").strip()
        if not code:
            return False
        for inv in self.repo.find(code=code):
            if inv.is_valid():
                inv.uses += 1
                if email:
                    inv.used_by = [*inv.used_by, email]
                self.repo.add(inv)
                return True
        return False
