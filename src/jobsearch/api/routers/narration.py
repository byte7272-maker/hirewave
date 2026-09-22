"""Narration — read any text (a résumé/cover-letter summary, a review, a change
note) aloud in an AI voice.

Two endpoints power a "read to me" voice switch anywhere in the app:

* ``GET  /api/v1/narration/voices`` -- the voices the switch can offer, plus
  whether server-side neural voices are available. When they are not (the
  offline default), the client falls back to the browser's own Web Speech
  voices, so the switch still works with no key configured.
* ``POST /api/v1/narration/speak`` -- synthesize the given text to audio bytes
  in the chosen voice. Returns 501 when no server TTS source is configured, the
  client's cue to speak locally with the browser voice instead.

This reuses the same neural-voice source (`state.speech`) as the mock interview,
so setting ``JOBSEARCH_TTS_PROVIDER`` + key lights up AI voices everywhere.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import TtsRequest
from jobsearch.engines.interview import voice_catalog

router = APIRouter(prefix="/api/v1/narration", tags=["narration"])

#: Cap the text a single narration request will synthesize. Summaries are short;
#: this stops an oversized body from running up a provider bill by accident.
_MAX_NARRATION_CHARS = 8000


@router.get("/voices")
def list_voices(user: CurrentUser, state: StateDep) -> dict:
    """The voice catalog for the read-aloud switch.

    ``server_tts`` says whether neural voices are available; when false, the
    client uses ``browser_fallback`` (the browser's built-in Web Speech voices)
    so the feature works with no provider configured. ``voices`` lists the
    server voices (id + display name + gender) for the active provider."""
    voices = voice_catalog(state.settings)
    return {
        "server_tts": state.speech.enabled,
        "provider": state.settings.tts_provider,
        "media_type": state.settings.tts_media_type,
        "default_voice": state.settings.tts_voice or (voices[0]["id"] if voices else ""),
        "voices": voices,
        # Always true: the browser can always read text with its own voices, so
        # the switch is never dead even without a server neural-voice source.
        "browser_fallback": True,
    }


@router.post("/speak")
def speak(body: TtsRequest, user: CurrentUser, state: StateDep) -> Response:
    """Read ``text`` aloud in an AI voice, returning audio bytes.

    501 when no server neural-voice source is configured -- the client then
    speaks with the browser voice. Audio is transient and marked no-store."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text is empty")
    if len(text) > _MAX_NARRATION_CHARS:
        raise HTTPException(
            413,  # content too large (constant name varies across Starlette versions)
            f"text too long to narrate (max {_MAX_NARRATION_CHARS} characters)",
        )
    if not state.speech.enabled:
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED, "no neural-voice source configured"
        )
    audio = state.speech.synthesize(text, voice=body.voice)
    if audio is None:
        detail = "voice source did not return audio"
        err = getattr(state.speech, "last_error", "")
        if err:
            detail = f"{detail} ({err})"
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail)
    return Response(
        content=audio,
        media_type=state.settings.tts_media_type,
        headers={"Cache-Control": "no-store"},
    )
