"""Auto-pull job-alert emails from a connected Gmail inbox (read scope).

``MockGmailAlertFetcher`` returns deterministic sample alerts so the sync flow
is testable offline; ``HttpGmailAlertFetcher`` queries the real Gmail API with
the user's OAuth token (the ``gmail.readonly`` scope is already requested when
the user connects Gmail). Returns raw email bodies for the inbox to parse.
"""

from __future__ import annotations

import base64
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings

# Which senders count as job alerts (used by the real Gmail query).
_ALERT_QUERY = "from:(linkedin.com OR indeed.com OR glassdoor.com OR ziprecruiter.com OR monster.com) newer_than:7d"

_SAMPLE = [
    """From: LinkedIn Job Alerts <jobs-noreply@linkedin.com>
Subject: 2 new jobs for you
Content-Type: text/html

<a href="https://www.linkedin.com/jobs/view/900001">Senior Data Engineer</a><span>Snowflake &middot; Remote</span>
<a href="https://www.linkedin.com/jobs/view/900002">Analytics Engineer</a><span>dbt Labs &middot; Remote</span>""",
    """From: Indeed <alert@indeed.com>
Subject: New: Machine Learning Engineer
Content-Type: text/html

<a href="https://www.indeed.com/viewjob?jk=ml777">Machine Learning Engineer</a><span>OpenAI &middot; San Francisco</span>""",
]


@runtime_checkable
class GmailAlertFetcher(Protocol):
    @property
    def live(self) -> bool: ...

    def fetch(self, *, access_token: str = "", max_messages: int = 10) -> list[str]: ...


class MockGmailAlertFetcher:
    live = False

    def fetch(self, *, access_token: str = "", max_messages: int = 10) -> list[str]:
        return list(_SAMPLE[:max_messages])


class HttpGmailAlertFetcher:
    live = True

    def __init__(self, *, timeout: float = 20.0) -> None:
        self._timeout = timeout

    def fetch(self, *, access_token: str = "", max_messages: int = 10) -> list[str]:  # pragma: no cover - network
        import httpx

        if not access_token:
            return []
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            listing = httpx.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers=headers, params={"q": _ALERT_QUERY, "maxResults": max_messages}, timeout=self._timeout,
            )
            listing.raise_for_status()
            ids = [m["id"] for m in listing.json().get("messages", [])]
        except (httpx.HTTPError, ValueError, KeyError):
            return []
        raws: list[str] = []
        for mid in ids:
            try:
                msg = httpx.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}",
                    headers=headers, params={"format": "raw"}, timeout=self._timeout,
                )
                msg.raise_for_status()
                raw_b64 = msg.json().get("raw", "")
                if raw_b64:
                    raws.append(base64.urlsafe_b64decode(raw_b64 + "===").decode("utf-8", "replace"))
            except (httpx.HTTPError, ValueError):
                continue
        return raws


def build_gmail_fetcher(settings: Optional[Settings] = None) -> GmailAlertFetcher:
    s = settings or get_settings()
    return HttpGmailAlertFetcher() if s.gmail_fetch == "http" else MockGmailAlertFetcher()
