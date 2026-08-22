"""Voice cloning — produce a custom neural voice from uploaded audio samples.

Same provider-port shape as the rest of the platform: an offline ``mock`` stub
(deterministic fake voice ids, so the whole create/list/delete flow is testable
with no vendor), a real ``elevenlabs`` adapter behind an env flag + key, and a
``none`` default that reports the framework as disabled.

The produced ``external_id`` is a voice id the TTS provider can then speak *any*
text with — that's what lets a cloned voice read the dynamic interview questions
(an uploaded clip alone can only play back its own audio).

⚠️ Consent: cloning a real person's voice has legal/ethical weight. The API layer
requires the user to attest they own or have permission to use the voice before
this is ever called; providers here only see samples the user explicitly submits.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


@dataclass
class ClonedVoiceResult:
    provider: str
    external_id: str  # the voice id the TTS provider speaks with
    status: str = "ready"  # "ready" | "processing" | "failed"
    preview_url: str = ""


@runtime_checkable
class VoiceCloneProvider(Protocol):
    @property
    def enabled(self) -> bool: ...

    def create(
        self, name: str, samples: list[bytes], *, description: str = ""
    ) -> Optional[ClonedVoiceResult]: ...

    def delete(self, external_id: str) -> bool: ...


class NullVoiceCloneProvider:
    """Framework off — the client shows 'custom voices unavailable'."""

    enabled = False

    def create(self, name, samples, *, description=""):  # noqa: D401
        return None

    def delete(self, external_id: str) -> bool:
        return False


class MockVoiceCloneProvider:
    """Offline stub — returns a deterministic fake voice id from the name so the
    create/list/delete flow works in dev and tests without any vendor call."""

    enabled = True

    def __init__(self) -> None:
        self._deleted: set[str] = set()

    def create(self, name: str, samples: list[bytes], *, description: str = "") -> Optional[ClonedVoiceResult]:
        if not name.strip() or not samples:
            return None
        digest = hashlib.md5((name.strip().lower() + str(len(samples))).encode()).hexdigest()[:16]
        return ClonedVoiceResult(provider="mock", external_id=f"mock_voice_{digest}", status="ready")

    def delete(self, external_id: str) -> bool:
        self._deleted.add(external_id)
        return True


class ElevenLabsVoiceCloneProvider:
    """Real ElevenLabs instant voice cloning (``POST /v1/voices/add``)."""

    enabled = True
    _ADD = "https://api.elevenlabs.io/v1/voices/add"
    _DEL = "https://api.elevenlabs.io/v1/voices"

    def __init__(self, api_key: str, *, timeout: float = 60.0) -> None:
        self._api_key = api_key
        self._timeout = timeout

    def create(  # pragma: no cover - network
        self, name: str, samples: list[bytes], *, description: str = ""
    ) -> Optional[ClonedVoiceResult]:
        import httpx

        files = [("files", (f"sample_{i}.mp3", data, "audio/mpeg")) for i, data in enumerate(samples)]
        data = {"name": name}
        if description:
            data["description"] = description
        try:
            resp = httpx.post(
                self._ADD,
                headers={"xi-api-key": self._api_key},
                data=data,
                files=files,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            body = resp.json()
        except (httpx.HTTPError, ValueError):
            return None
        vid = body.get("voice_id") if isinstance(body, dict) else None
        if not vid:
            return None
        return ClonedVoiceResult(provider="elevenlabs", external_id=vid, status="ready")

    def delete(self, external_id: str) -> bool:  # pragma: no cover - network
        import httpx

        try:
            resp = httpx.delete(
                f"{self._DEL}/{external_id}",
                headers={"xi-api-key": self._api_key},
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return False
        return True


def build_voice_clone_provider(settings: Optional[Settings] = None) -> VoiceCloneProvider:
    s = settings or get_settings()
    if s.voice_clone_provider == "elevenlabs":
        key = s.voice_clone_api_key or s.tts_api_key
        if key:
            return ElevenLabsVoiceCloneProvider(key, timeout=s.voice_clone_timeout_seconds)
    if s.voice_clone_provider == "mock":
        return MockVoiceCloneProvider()
    return NullVoiceCloneProvider()
