"""Reminder delivery channels — SMS and Web Push.

Mock by default (records instead of sending) so the whole flow is offline and
testable; env-gated real adapters (a generic SMS HTTP API, and VAPID Web Push)
turn on when configured. Email + in-app reuse the existing senders.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


# --- SMS -------------------------------------------------------------------
@runtime_checkable
class SmsSender(Protocol):
    @property
    def live(self) -> bool: ...
    def send(self, *, to: str, body: str) -> bool: ...


class MockSmsSender:
    live = False

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, *, to: str, body: str) -> bool:
        self.sent.append({"to": to, "body": body})
        return True


class HttpSmsSender:
    """POST {to, from, body} to a generic SMS API (front Twilio/Vonage/… with a
    thin proxy, or any webhook that relays a text)."""

    live = True

    def __init__(self, url: str, *, api_key: str = "", sender: str = "", timeout: float = 15.0) -> None:
        self._url = url
        self._api_key = api_key
        self._from = sender
        self._timeout = timeout

    def send(self, *, to: str, body: str) -> bool:  # pragma: no cover - network
        import httpx

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            resp = httpx.post(
                self._url, headers=headers, timeout=self._timeout,
                json={"from": self._from, "to": to, "body": body},
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return False
        return True


def build_sms_sender(settings: Optional[Settings] = None) -> SmsSender:
    s = settings or get_settings()
    if s.sms_provider == "http" and s.sms_provider_url:
        return HttpSmsSender(s.sms_provider_url, api_key=s.sms_api_key, sender=s.sms_from)
    return MockSmsSender()


# --- Web Push --------------------------------------------------------------
@runtime_checkable
class PushSender(Protocol):
    @property
    def live(self) -> bool: ...
    def send(self, *, subscription: dict, title: str, body: str, url: str = "") -> bool: ...


class MockPushSender:
    live = False

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, *, subscription: dict, title: str, body: str, url: str = "") -> bool:
        self.sent.append({"subscription": subscription, "title": title, "body": body, "url": url})
        return True


class WebPushSender:
    """Send a browser push via VAPID (needs the `automation`/`webpush` extra:
    ``pip install pywebpush``)."""

    live = True

    def __init__(self, *, private_key: str, subject: str, timeout: float = 15.0) -> None:
        self._private_key = private_key
        self._subject = subject
        self._timeout = timeout

    def send(self, *, subscription: dict, title: str, body: str, url: str = "") -> bool:  # pragma: no cover - network
        import json

        try:
            from pywebpush import WebPushException, webpush
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("pywebpush not installed — pip install pywebpush") from exc
        try:
            webpush(
                subscription_info=subscription,
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                timeout=self._timeout,
            )
        except WebPushException:
            return False
        return True


def build_push_sender(settings: Optional[Settings] = None) -> PushSender:
    s = settings or get_settings()
    if s.push_provider == "webpush" and s.vapid_private_key:
        return WebPushSender(private_key=s.vapid_private_key, subject=s.vapid_subject)
    return MockPushSender()
