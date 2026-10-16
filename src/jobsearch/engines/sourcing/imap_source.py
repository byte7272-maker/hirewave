"""Pull job email from a DEDICATED (or any authorized) mailbox over IMAP.

A dedicated job account is the best-privacy option: it holds ONLY job-related mail —
applications sent from it, replies, recruiter threads, board alerts — so a full scan
exposes nothing personal. The same source also works for any mailbox the user authorizes
with IMAP credentials (app password or XOAUTH2). It returns raw RFC 822 strings — the
same shape ``gmail_fetch`` returns — which :mod:`job_email` classifies and the inbox
pipeline ingests.

``MockJobMailSource`` returns deterministic sample mail so the scan flow is testable
offline; ``ImapJobMailSource`` connects to a real server over TLS via ``imaplib``.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings

# A spread of job-email KINDS a real dedicated inbox holds (not just board alerts), so
# the classifier + scan flow are exercised end-to-end offline.
_SAMPLE = [
    """From: Jordan Lee <jordan@northwind-talent.com>
Subject: Exciting opportunity at Globex
Content-Type: text/plain

Hi — I came across your profile and think you'd be a great fit for an open Staff
Engineer role at Globex. Would you be open to a quick chat?""",
    """From: no-reply@acme.greenhouse-mail.io
Subject: Thank you for applying to Acme
Content-Type: text/plain

We received your application for Senior Data Engineer and will be in touch.""",
    """From: recruiting@globex.lever.co
Subject: Next steps for your application
Content-Type: text/plain

We'd love to schedule a call — what's your availability for a phone screen this week?""",
    """From: careers@initech.icims.com
Subject: Update on your application
Content-Type: text/plain

Unfortunately, we have decided not to proceed with other candidates at this time.""",
]


@runtime_checkable
class JobMailSource(Protocol):
    @property
    def live(self) -> bool: ...

    def fetch(self, *, max_messages: int = 25) -> list[str]: ...


class MockJobMailSource:
    """Offline default — deterministic sample mail across job-email kinds."""

    live = False

    def fetch(self, *, max_messages: int = 25) -> list[str]:
        return list(_SAMPLE[:max_messages])


class ImapJobMailSource:
    """Read recent mail from a real mailbox over IMAP (TLS)."""

    live = True

    def __init__(
        self,
        *,
        host: str,
        port: int = 993,
        username: str = "",
        password: str = "",
        mailbox: str = "INBOX",
        timeout: float = 20.0,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._mailbox = mailbox or "INBOX"
        self._timeout = timeout

    def fetch(self, *, max_messages: int = 25) -> list[str]:  # pragma: no cover - network
        import imaplib

        if not (self._host and self._username and self._password):
            return []
        raws: list[str] = []
        conn: Optional["imaplib.IMAP4_SSL"] = None
        try:
            conn = imaplib.IMAP4_SSL(self._host, self._port, timeout=self._timeout)
            conn.login(self._username, self._password)
            conn.select(self._mailbox, readonly=True)
            typ, data = conn.search(None, "ALL")
            if typ != "OK" or not data or not data[0]:
                return []
            ids = data[0].split()[-max_messages:]
            for mid in reversed(ids):  # newest first
                typ, msg_data = conn.fetch(mid, "(RFC822)")
                if typ != "OK" or not msg_data:
                    continue
                for part in msg_data:
                    if isinstance(part, tuple) and part[1]:
                        raws.append(part[1].decode("utf-8", "replace"))
                        break
        except Exception:  # noqa: BLE001 - network/auth error -> no mail, never crash the scan
            return raws
        finally:
            if conn is not None:
                try:
                    conn.logout()
                except Exception:  # noqa: BLE001
                    pass
        return raws


def build_job_mail_source(settings: Optional[Settings] = None) -> JobMailSource:
    """The configured dedicated/IMAP mailbox source, or the offline mock."""
    s = settings or get_settings()
    if (
        getattr(s, "job_mailbox", "mock") == "imap"
        and getattr(s, "job_mailbox_host", "")
        and getattr(s, "job_mailbox_user", "")
    ):
        return ImapJobMailSource(
            host=s.job_mailbox_host,
            port=getattr(s, "job_mailbox_port", 993),
            username=s.job_mailbox_user,
            password=getattr(s, "job_mailbox_password", ""),
            mailbox=getattr(s, "job_mailbox_folder", "INBOX"),
        )
    return MockJobMailSource()
