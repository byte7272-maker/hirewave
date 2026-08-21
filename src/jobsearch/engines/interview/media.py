"""Pluggable media sources for the mock interview — neural voice + talking-head
video — that a user points at their own service to *upgrade* the experience.

Design mirrors the rest of the platform: a small port with an offline default
(``none`` → nothing rendered, the client uses its browser voice + animated
avatar) and a generic ``http`` adapter that speaks a simple, vendor-neutral
contract so you can front ElevenLabs / OpenAI / Azure / D-ID / HeyGen or your
own gateway without changing this code:

* TTS  — ``POST {tts_url}``  body ``{"text": ..., "voice": ...}`` → **audio bytes**
* Video — ``POST {avatar_url}`` body ``{"persona": {...}, "text": ...}`` → ``{"video_url": ...}``

Both send ``Authorization: Bearer <key>`` when a key is configured. Failures
never raise into the interview flow — they degrade to the offline default.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


# --- neural voice (text-to-speech) -----------------------------------------
@runtime_checkable
class SpeechProvider(Protocol):
    """Synthesizes an interviewer line to audio. ``enabled`` is False for the
    offline default so callers know to fall back to the browser voice."""

    @property
    def enabled(self) -> bool: ...

    def synthesize(self, text: str, *, voice: str = "") -> Optional[bytes]: ...


class NullSpeechProvider:
    """Offline default — no server-side audio; the client speaks locally."""

    enabled = False

    def synthesize(self, text: str, *, voice: str = "") -> Optional[bytes]:
        return None


class HttpSpeechProvider:
    """Generic TTS over a user-directed HTTP endpoint (returns audio bytes)."""

    enabled = True

    def __init__(self, url: str, *, api_key: str = "", timeout: float = 30.0) -> None:
        self._url = url
        self._api_key = api_key
        self._timeout = timeout

    def synthesize(self, text: str, *, voice: str = "") -> Optional[bytes]:  # pragma: no cover - network
        import httpx

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            resp = httpx.post(
                self._url,
                headers=headers,
                json={"text": text, "voice": voice},
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return None  # degrade to the browser voice; never break the interview
        return resp.content


def build_speech_provider(settings: Optional[Settings] = None) -> SpeechProvider:
    s = settings or get_settings()
    if s.tts_provider == "http" and s.tts_url:
        return HttpSpeechProvider(s.tts_url, api_key=s.tts_api_key, timeout=s.tts_timeout_seconds)
    return NullSpeechProvider()


# --- neural talking-head video ---------------------------------------------
@runtime_checkable
class AvatarVideoProvider(Protocol):
    """Renders a talking-head clip of the interviewer speaking ``text``.
    Returns a playable URL, or None to fall back to the animated avatar."""

    @property
    def enabled(self) -> bool: ...

    def render(self, *, persona: dict, text: str) -> Optional[str]: ...


class NullAvatarVideoProvider:
    """Offline default — the client renders its animated SVG avatar."""

    enabled = False

    def render(self, *, persona: dict, text: str) -> Optional[str]:
        return None


class HttpAvatarVideoProvider:
    """Generic talking-head video over a user-directed HTTP endpoint."""

    enabled = True

    def __init__(self, url: str, *, api_key: str = "", timeout: float = 60.0) -> None:
        self._url = url
        self._api_key = api_key
        self._timeout = timeout

    def render(self, *, persona: dict, text: str) -> Optional[str]:  # pragma: no cover - network
        import httpx

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            resp = httpx.post(
                self._url,
                headers=headers,
                json={"persona": persona, "text": text},
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError):
            return None
        url = data.get("video_url") if isinstance(data, dict) else None
        return url or None


def build_avatar_provider(settings: Optional[Settings] = None) -> AvatarVideoProvider:
    s = settings or get_settings()
    if s.avatar_provider == "http" and s.avatar_url:
        return HttpAvatarVideoProvider(s.avatar_url, api_key=s.avatar_api_key, timeout=s.avatar_timeout_seconds)
    return NullAvatarVideoProvider()
