"""Outbound email — send invitations (mock offline, http to your email API)."""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


@runtime_checkable
class EmailSender(Protocol):
    @property
    def live(self) -> bool: ...

    def send(self, *, to: str, subject: str, body: str) -> bool: ...


class MockEmailSender:
    """Records the message instead of sending — the invite code/link is still
    returned to the caller, so the flow works with no email provider."""

    live = False

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, *, to: str, subject: str, body: str) -> bool:
        self.sent.append({"to": to, "subject": subject, "body": body})
        return True


class HttpEmailSender:
    """POST to a generic email API (front SendGrid/Postmark/… with a thin proxy)."""

    live = True

    def __init__(self, url: str, *, api_key: str = "", sender: str = "", timeout: float = 15.0) -> None:
        self._url = url
        self._api_key = api_key
        self._from = sender
        self._timeout = timeout

    def send(self, *, to: str, subject: str, body: str) -> bool:  # pragma: no cover - network
        import httpx

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            resp = httpx.post(
                self._url, headers=headers, timeout=self._timeout,
                json={"from": self._from, "to": to, "subject": subject, "text": body},
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return False
        return True


def build_email_sender(settings: Optional[Settings] = None) -> EmailSender:
    s = settings or get_settings()
    if s.email_sender == "http" and s.email_sender_url:
        return HttpEmailSender(s.email_sender_url, api_key=s.email_sender_api_key, sender=s.email_from)
    return MockEmailSender()
