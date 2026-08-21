"""Gmail send client + MIME builder for live email submission.

The Gmail API sends a message via ``POST /gmail/v1/users/me/messages/send`` with
a base64url-encoded RFC 822 message in ``{"raw": ...}`` and the user's OAuth
access token as a bearer credential. The token comes from the integration
engine (``IntegrationEngine.get_access_token(user_id, Provider.GMAIL)``), which
decrypts and refreshes it — this module never touches raw token storage.

``GmailClient`` is injectable so the whole flow is testable offline with a fake.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Sequence

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


@dataclass
class Attachment:
    filename: str
    data: bytes
    maintype: str = "text"
    subtype: str = "markdown"


def build_raw_message(
    *,
    to: str,
    subject: str,
    body: str,
    sender: str = "me",
    attachments: Sequence[Attachment] = (),
) -> str:
    """Build a base64url-encoded RFC 822 message for the Gmail send API."""
    msg = EmailMessage()
    msg["To"] = to
    if sender and sender != "me":
        msg["From"] = sender
    msg["Subject"] = subject
    msg.set_content(body)
    for att in attachments:
        msg.add_attachment(
            att.data, maintype=att.maintype, subtype=att.subtype, filename=att.filename
        )
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


class GmailClient:
    """Thin wrapper over the Gmail send endpoint."""

    def __init__(self, *, timeout: float = 20.0) -> None:
        self._timeout = timeout

    def send_raw(self, access_token: str, raw_b64: str) -> dict:
        """Send a pre-built raw message; returns the Gmail API response dict."""
        import httpx

        resp = httpx.post(
            GMAIL_SEND_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw_b64},
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()
