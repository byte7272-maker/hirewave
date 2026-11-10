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

    def synthesize(
        self, text: str, *, voice: str = "", instructions: str = ""
    ) -> Optional[bytes]: ...


class NullSpeechProvider:
    """Offline default — no server-side audio; the client speaks locally."""

    enabled = False

    def synthesize(self, text: str, *, voice: str = "", instructions: str = "") -> Optional[bytes]:
        return None


class HttpSpeechProvider:
    """Generic TTS over a user-directed HTTP endpoint (returns audio bytes)."""

    enabled = True

    def __init__(self, url: str, *, api_key: str = "", timeout: float = 30.0) -> None:
        self._url = url
        self._api_key = api_key
        self._timeout = timeout

    def synthesize(self, text: str, *, voice: str = "", instructions: str = "") -> Optional[bytes]:  # pragma: no cover - network
        import httpx

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        payload = {"text": text, "voice": voice}
        if instructions:
            payload["instructions"] = instructions
        try:
            resp = httpx.post(
                self._url,
                headers=headers,
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return None  # degrade to the browser voice; never break the interview
        return resp.content


class ElevenLabsSpeechProvider:
    """First-class ElevenLabs TTS. ``voice`` (per call) overrides the default;
    with a cloned voice's id it speaks arbitrary text in that voice."""

    enabled = True
    _BASE = "https://api.elevenlabs.io/v1/text-to-speech"

    def __init__(
        self, api_key: str, *, voice: str = "", model: str = "", timeout: float = 30.0
    ) -> None:
        self._api_key = api_key
        self._voice = voice or "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — a stock voice
        self._model = model or "eleven_turbo_v2_5"
        self._timeout = timeout
        self.last_error = ""

    def synthesize(self, text: str, *, voice: str = "", instructions: str = "") -> Optional[bytes]:  # pragma: no cover - network
        import httpx

        # ElevenLabs steers tone through voice settings, not a free-text instruction,
        # so ``instructions`` is accepted for signature parity and ignored here.
        vid = voice or self._voice
        try:
            resp = httpx.post(
                f"{self._BASE}/{vid}",
                headers={"xi-api-key": self._api_key, "Content-Type": "application/json"},
                json={"text": text, "model_id": self._model},
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            self.last_error = f"{e.response.status_code}: {e.response.text[:300]}"
            return None
        except httpx.HTTPError as e:
            self.last_error = str(e)[:300]
            return None
        self.last_error = ""
        return resp.content


class OpenAISpeechProvider:
    """First-class OpenAI TTS (``/v1/audio/speech``). ``voice`` names a built-in
    voice (alloy, echo, fable, onyx, nova, shimmer, …)."""

    enabled = True
    _URL = "https://api.openai.com/v1/audio/speech"

    def __init__(
        self, api_key: str, *, voice: str = "", model: str = "", timeout: float = 30.0
    ) -> None:
        self._api_key = api_key
        self._voice = voice or "alloy"
        # tts-1 is universally available + cheapest; opt into gpt-4o-mini-tts via
        # JOBSEARCH_TTS_MODEL when the account has it.
        self._model = model or "tts-1"
        self._timeout = timeout
        self.last_error = ""

    def synthesize(self, text: str, *, voice: str = "", instructions: str = "") -> Optional[bytes]:  # pragma: no cover - network
        import httpx

        payload = {"model": self._model, "voice": voice or self._voice, "input": text}
        # Tone steering via ``instructions`` is only supported by the gpt-4o-mini-tts
        # model; tts-1 / tts-1-hd reject unknown fields, so only send it when supported.
        if instructions and "gpt-4o" in self._model:
            payload["instructions"] = instructions
        try:
            resp = httpx.post(
                self._URL,
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            self.last_error = f"{e.response.status_code}: {e.response.text[:300]}"
            return None
        except httpx.HTTPError as e:
            self.last_error = str(e)[:300]
            return None
        self.last_error = ""
        return resp.content


# Stock OpenAI TTS voices, universally available on the tts-1 / tts-1-hd models.
# (id, display name, gender) — the label + gender let a UI show a readable picker.
OPENAI_STOCK_VOICES = [
    ("alloy", "Alloy", "neutral"),
    ("echo", "Echo", "male"),
    ("fable", "Fable", "neutral"),
    ("onyx", "Onyx", "male"),
    ("nova", "Nova", "female"),
    ("shimmer", "Shimmer", "female"),
]
# Extra expressive voices exposed by the gpt-4o-mini-tts model.
OPENAI_EXTRA_VOICES = [
    ("ash", "Ash", "male"),
    ("ballad", "Ballad", "male"),
    ("coral", "Coral", "female"),
    ("sage", "Sage", "female"),
    ("verse", "Verse", "neutral"),
]


def voice_catalog(settings: Optional[Settings] = None) -> list[dict]:
    """The server-side neural voices available for the active TTS provider, so a
    UI can offer a voice switch. Empty when no server TTS is configured (the
    client then speaks with the browser's own Web Speech voices)."""
    s = settings or get_settings()
    if s.tts_provider == "openai" and s.tts_api_key:
        voices = list(OPENAI_STOCK_VOICES)
        if "gpt-4o-mini-tts" in (s.tts_model or ""):
            voices += OPENAI_EXTRA_VOICES
        return [{"id": v, "name": n, "gender": g, "kind": "server"} for v, n, g in voices]
    if s.tts_provider == "elevenlabs" and s.tts_api_key:
        vid = s.tts_voice or "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — a stock voice
        return [{"id": vid, "name": "Default voice", "gender": "neutral", "kind": "server"}]
    if s.tts_provider == "http" and s.tts_url and s.tts_voice:
        return [{"id": s.tts_voice, "name": "Default voice", "gender": "neutral", "kind": "server"}]
    return []


# ---- speech-to-text (transcribe recorded audio -> text) --------------------
# Decouples capture (universal: getUserMedia + MediaRecorder) from transcription,
# so voice input works on ANY browser/device, not just those with the browser's
# SpeechRecognition API. The client records audio and POSTs it here.

def _iso_639_1(lang: str) -> str:
    """Whisper's ``language`` param wants an ISO-639-1 code (``en``), not a browser
    BCP-47 tag (``en-US`` / ``en-us``). Browsers send ``navigator.language`` verbatim,
    which 400s the API ("Invalid language 'en-us'"). Keep only the primary subtag,
    lowercased; drop anything that isn't a 2-3 letter alphabetic code (then no hint is
    sent and the model auto-detects)."""
    code = (lang or "").strip().replace("_", "-").split("-", 1)[0].lower()
    return code if code.isalpha() and 2 <= len(code) <= 3 else ""


@runtime_checkable
class TranscribeProvider(Protocol):
    @property
    def enabled(self) -> bool: ...

    def transcribe(
        self, audio: bytes, *, filename: str = "audio.webm", content_type: str = "", language: str = ""
    ) -> Optional[str]: ...


class NullTranscribeProvider:
    """STT off — the endpoint returns 501 and the client falls back to the browser's
    own SpeechRecognition (where available)."""

    enabled = False

    def transcribe(self, audio, *, filename="audio.webm", content_type="", language=""):  # noqa: D401
        return None


class OpenAITranscribeProvider:
    """OpenAI speech-to-text (``POST /v1/audio/transcriptions``). Model defaults to
    ``whisper-1``; any recordable audio container (webm/ogg/mp3/wav/m4a) works."""

    enabled = True
    _URL = "https://api.openai.com/v1/audio/transcriptions"

    def __init__(self, api_key: str, *, model: str = "whisper-1", timeout: float = 30.0) -> None:
        self._api_key = api_key
        self._model = model or "whisper-1"
        self._timeout = timeout
        self.last_error = ""

    def transcribe(  # pragma: no cover - network
        self, audio: bytes, *, filename: str = "audio.webm", content_type: str = "", language: str = ""
    ) -> Optional[str]:
        import httpx

        files = {"file": (filename or "audio.webm", audio, content_type or "application/octet-stream")}
        data = {"model": self._model}
        lang = _iso_639_1(language)
        if lang:
            data["language"] = lang
        try:
            resp = httpx.post(
                self._URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                data=data,
                files=files,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            body = resp.json()
        except httpx.HTTPStatusError as e:
            self.last_error = f"{e.response.status_code}: {e.response.text[:300]}"
            return None
        except (httpx.HTTPError, ValueError) as e:
            self.last_error = str(e)[:300]
            return None
        self.last_error = ""
        return (body.get("text") if isinstance(body, dict) else "") or ""


def build_transcribe_provider(settings: Optional[Settings] = None) -> TranscribeProvider:
    s = settings or get_settings()
    if s.stt_provider == "openai":
        key = s.stt_api_key or s.tts_api_key  # reuse the OpenAI TTS key by default
        if key:
            return OpenAITranscribeProvider(key, model=s.stt_model, timeout=s.stt_timeout_seconds)
    return NullTranscribeProvider()


def build_speech_provider(settings: Optional[Settings] = None) -> SpeechProvider:
    s = settings or get_settings()
    if s.tts_provider == "elevenlabs" and s.tts_api_key:
        return ElevenLabsSpeechProvider(
            s.tts_api_key, voice=s.tts_voice, model=s.tts_model, timeout=s.tts_timeout_seconds
        )
    if s.tts_provider == "openai" and s.tts_api_key:
        return OpenAISpeechProvider(
            s.tts_api_key, voice=s.tts_voice, model=s.tts_model, timeout=s.tts_timeout_seconds
        )
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
