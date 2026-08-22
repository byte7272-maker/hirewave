"""Interview prep — suggest questions with résumé-grounded answers."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models.common import utcnow
from jobsearch.api.schemas import (
    AvatarVideoRequest,
    InterviewPrepRequest,
    MockInterviewReplyRequest,
    MockInterviewStartRequest,
    PersonaVoiceUpdate,
    TtsRequest,
    VocabularyRequest,
)
from jobsearch.models import (
    CustomVoice,
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
    InterviewPrep,
    MockInterviewSession,
    PersonaVoice,
    SessionStatus,
    UserProfile,
    VocabularyAnalysis,
    VoiceSource,
)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])

#: Audio formats a browser <audio> element can reliably play. Uploaded persona
#: voice clips must be one of these so playback is compatible everywhere.
_AUDIO_TYPES = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/x-m4a": "m4a",
}


@router.post("/prep", response_model=InterviewPrep, status_code=status.HTTP_201_CREATED)
def generate_prep(
    body: InterviewPrepRequest, user: CurrentUser, state: StateDep
) -> InterviewPrep:
    """Generate likely interview questions + suggested answers.

    Answers are grounded in the selected résumé's text (an uploaded PDF/DOCX,
    or a generated résumé) when available, otherwise the structured profile —
    plus any work-experience highlights the user has brought in (self-written or
    produced by an AI agent in their work environment). Optionally tailored to a
    target job posting.
    """
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)

    resume = None
    if body.resume_id:
        resume = state.resumes.get(body.resume_id)
        if resume is None or resume.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")

    job = None
    if body.job_posting_id:
        job = state.jobs.get(body.job_posting_id)
        if job is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")

    experience_context = state.experience.context_text(user.id)
    return state.interview.generate(
        profile,
        resume=resume,
        job=job,
        count=body.count,
        experience_context=experience_context,
    )


# --- mock interview trainer -------------------------------------------------
def _resolve(body, user, state):
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    resume = state.resumes.get(body.resume_id) if body.resume_id else None
    if body.resume_id and (resume is None or resume.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    job = state.jobs.get(body.job_posting_id) if body.job_posting_id else None
    if body.job_posting_id and job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    return profile, resume, job


@router.post("/mock/start", response_model=MockInterviewSession, status_code=status.HTTP_201_CREATED)
def start_mock(
    body: MockInterviewStartRequest, user: CurrentUser, state: StateDep
) -> MockInterviewSession:
    """Begin a conversational mock interview with an AI interviewer persona."""
    profile, resume, job = _resolve(body, user, state)
    style = None
    if body.style:
        try:
            style = InterviewerStyle(body.style)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown style '{body.style}'") from exc
    difficulty = None
    if body.difficulty:
        try:
            difficulty = InterviewDifficulty(body.difficulty)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"unknown difficulty '{body.difficulty}'"
            ) from exc
    session = state.mock_trainer.start_session(
        profile,
        resume=resume,
        job=job,
        style=style,
        difficulty=difficulty,
        max_questions=body.max_questions,
        persona_id=body.persona_id,
        questions=body.questions,
    )
    return state.mock_interviews.add(session)


def _owned_session(session_id: str, user, state) -> MockInterviewSession:
    session = state.mock_interviews.get(session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "interview session not found")
    return session


@router.post("/mock/{session_id}/reply", response_model=MockInterviewSession)
def reply_mock(
    session_id: str, body: MockInterviewReplyRequest, user: CurrentUser, state: StateDep
) -> MockInterviewSession:
    """Submit the candidate's answer; get it rated + the interviewer's next turn."""
    session = _owned_session(session_id, user, state)
    if not body.answer.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "answer is empty")
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "this interview is already complete")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    job = state.jobs.get(session.job_posting_id) if session.job_posting_id else None
    session = state.mock_trainer.reply(
        session, profile, body.answer, job=job, response_seconds=body.response_seconds
    )
    return state.mock_interviews.add(session)  # persist mutation


@router.get("/mock/{session_id}", response_model=MockInterviewSession)
def get_mock(session_id: str, user: CurrentUser, state: StateDep) -> MockInterviewSession:
    return _owned_session(session_id, user, state)


@router.get("/mock", response_model=list[MockInterviewSession])
def list_mock(user: CurrentUser, state: StateDep) -> list[MockInterviewSession]:
    return state.mock_interviews.find(user_id=user.id)


@router.post("/vocabulary", response_model=VocabularyAnalysis)
def analyze_vocabulary(
    body: VocabularyRequest, user: CurrentUser, state: StateDep
) -> VocabularyAnalysis:
    """Analyze the vocabulary of a spoken answer (recorded or live-transcribed).

    Returns filler words, weak/vague words with stronger alternatives, over-used
    words, a richness metric and a 0-100 strength score. Deterministic and fast
    enough to call on a live transcript as the user speaks; pass ``rewrite: true``
    to also get an LLM-polished version of the whole answer.
    """
    return state.vocabulary.analyze(body.text, rewrite=body.rewrite)


# --- user-directed media + persona sources ----------------------------------
@router.get("/media/capabilities")
def media_capabilities(user: CurrentUser, state: StateDep) -> dict:
    """What upgraded sources are configured, so the client knows whether to use
    server-side neural voice/video or its built-in browser voice + avatar."""
    return {
        "tts": state.speech.enabled,
        "video": state.avatar_video.enabled,
        "voice_clone": state.voice_clone.enabled,
        "personas": len(state.persona_library.all()),
    }


@router.get("/personas", response_model=list[InterviewerPersona])
def list_personas(user: CurrentUser, state: StateDep) -> list[InterviewerPersona]:
    """The interviewer gallery — each with an avatar image, a description (`bio`),
    a `difficulty` (easy → hard), and a `style`. Start a mock interview with one
    by passing its `id` as `persona_id` to `/mock/start`."""
    return state.persona_library.all()


@router.post("/tts")
def synthesize_tts(body: TtsRequest, user: CurrentUser, state: StateDep) -> Response:
    """Neural voice for an interviewer line via the configured TTS source.

    501 when no source is configured — the client then speaks with the browser
    voice. Audio is transient and sensitive to no one, but marked no-store."""
    if not state.speech.enabled:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "no neural-voice source configured")
    if not body.text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text is empty")
    audio = state.speech.synthesize(body.text, voice=body.voice)
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


@router.post("/video")
def render_video(body: AvatarVideoRequest, user: CurrentUser, state: StateDep) -> dict:
    """Talking-head clip URL for an interviewer line via the configured source.
    501 when unconfigured — the client uses its animated avatar instead."""
    if not state.avatar_video.enabled:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "no neural-video source configured")
    if not body.text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text is empty")
    url = state.avatar_video.render(persona=body.persona, text=body.text)
    if not url:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "video source did not return a clip")
    return {"video_url": url}


# --- per-persona voice selection (upload / change voice per persona) ---------
def _persona_or_404(state: StateDep, persona_id: str) -> InterviewerPersona:
    for p in state.persona_library.all():
        if p.id == persona_id:
            return p
    raise HTTPException(status.HTTP_404_NOT_FOUND, "persona not found")


def _voice_id(user_id: str, persona_id: str) -> str:
    return f"{user_id}:{persona_id}"


def _default_voice(user_id: str, persona: InterviewerPersona) -> PersonaVoice:
    """The effective voice when the user hasn't chosen one — carries the persona's
    gender/tone/voice_id hints so the client can auto-pick a matching voice."""
    return PersonaVoice(
        id=_voice_id(user_id, persona.id),
        user_id=user_id,
        persona_id=persona.id,
        source=VoiceSource.SERVER if persona.voice_id else VoiceSource.BROWSER,
        voice_id=persona.voice_id,
        lang="en-US",
    )


@router.get("/voices", response_model=list[PersonaVoice])
def list_voice_prefs(user: CurrentUser, state: StateDep) -> list[PersonaVoice]:
    """Every persona-voice the user has saved (empty when they've customized none).
    The client overlays these on the persona gallery."""
    return state.persona_voices.find(user_id=user.id)


@router.get("/personas/{persona_id}/voice", response_model=PersonaVoice)
def get_voice_pref(persona_id: str, user: CurrentUser, state: StateDep) -> PersonaVoice:
    """The effective voice for one persona — the user's saved choice, or a default
    derived from the persona's gender/tone if they haven't chosen one."""
    persona = _persona_or_404(state, persona_id)
    saved = state.persona_voices.get(_voice_id(user.id, persona_id))
    return saved or _default_voice(user.id, persona)


@router.put("/personas/{persona_id}/voice", response_model=PersonaVoice)
def set_voice_pref(
    persona_id: str, body: PersonaVoiceUpdate, user: CurrentUser, state: StateDep
) -> PersonaVoice:
    """Dynamically change a persona's voice: pick a browser voice (voice_uri +
    rate/pitch/lang), or point it at a server neural voice_id."""
    persona = _persona_or_404(state, persona_id)
    pref = state.persona_voices.get(_voice_id(user.id, persona_id)) or _default_voice(
        user.id, persona
    )
    data = body.model_dump(exclude_unset=True)
    if "source" in data and data["source"] is not None:
        try:
            pref.source = VoiceSource(data.pop("source"))
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid voice source") from exc
    if data.get("rate") is not None:
        pref.rate = max(0.5, min(2.0, float(data.pop("rate"))))
    if data.get("pitch") is not None:
        pref.pitch = max(0.0, min(2.0, float(data.pop("pitch"))))
    for field in ("voice_uri", "lang", "voice_id"):
        if data.get(field) is not None:
            setattr(pref, field, str(data[field]))
    pref.updated_at = utcnow()
    return state.persona_voices.add(pref)


@router.post("/personas/{persona_id}/voice/upload", response_model=PersonaVoice)
async def upload_voice_clip(
    persona_id: str,
    user: CurrentUser,
    state: StateDep,
    file: UploadFile = File(...),
) -> PersonaVoice:
    """Upload a custom audio clip for a persona (e.g. an intro/greeting in a real
    voice). Must be a web-playable format (mp3/wav/ogg/webm/m4a/aac)."""
    persona = _persona_or_404(state, persona_id)
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    if ctype not in _AUDIO_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "unsupported audio format; use mp3, wav, ogg, webm, m4a, or aac",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"file exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
        )
    pref = state.persona_voices.get(_voice_id(user.id, persona_id)) or _default_voice(
        user.id, persona
    )
    key = f"voice_{user.id}_{persona_id}"
    state.documents.put(key, data, content_type=ctype)
    pref.source = VoiceSource.UPLOADED
    pref.audio_url = f"/api/v1/interview/personas/{persona_id}/voice/audio"
    pref.content_type = ctype
    pref.original_filename = file.filename or f"voice.{_AUDIO_TYPES[ctype]}"
    pref.updated_at = utcnow()
    return state.persona_voices.add(pref)


@router.get("/personas/{persona_id}/voice/audio")
def get_voice_clip(persona_id: str, user: CurrentUser, state: StateDep) -> Response:
    """Stream back the user's uploaded voice clip for a persona (for <audio>)."""
    pref = state.persona_voices.get(_voice_id(user.id, persona_id))
    if pref is None or pref.source != VoiceSource.UPLOADED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no uploaded voice for this persona")
    stored = state.documents.get(f"voice_{user.id}_{persona_id}")
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "voice clip not found")
    audio, content_type = stored
    return Response(
        content=audio,
        media_type=content_type or pref.content_type or "audio/mpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/personas/{persona_id}/voice", status_code=status.HTTP_204_NO_CONTENT)
def reset_voice_pref(persona_id: str, user: CurrentUser, state: StateDep) -> None:
    """Reset a persona back to its default voice (clears any upload/choice)."""
    _persona_or_404(state, persona_id)
    key = _voice_id(user.id, persona_id)
    if state.persona_voices.get(key) is not None:
        state.persona_voices.delete(key)
    state.documents.delete(f"voice_{user.id}_{persona_id}")


# --- custom voices cloned from the user's audio samples ---------------------
@router.post("/voices/custom", response_model=CustomVoice, status_code=status.HTTP_201_CREATED)
async def create_custom_voice(
    user: CurrentUser,
    state: StateDep,
    name: str = Form(...),
    consent: bool = Form(False),
    files: list[UploadFile] = File(...),
) -> CustomVoice:
    """Produce a custom neural voice from uploaded audio samples.

    Requires ``consent`` — the user must affirm they own or have permission to use
    the voice. 501 when no cloning provider is configured. Samples must be
    web/vendor-friendly audio (mp3/wav/ogg/webm/m4a/aac). The resulting voice id
    can be assigned to a persona (``PUT .../voice`` with source=server), then it
    speaks the interview questions in that voice."""
    if not state.voice_clone.enabled:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "voice cloning is not configured")
    if not consent:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "consent required: you must own or have permission to use this voice",
        )
    if not name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "name is required")
    samples: list[bytes] = []
    for f in files:
        ctype = (f.content_type or "").split(";")[0].strip().lower()
        if ctype not in _AUDIO_TYPES:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                "unsupported audio format; use mp3, wav, ogg, webm, m4a, or aac",
            )
        data = await f.read()
        if not data:
            continue
        if len(data) > state.settings.max_upload_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"a sample exceeds {state.settings.max_upload_bytes // (1024 * 1024)} MB limit",
            )
        samples.append(data)
    if not samples:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "at least one audio sample is required")

    result = state.voice_clone.create(name.strip(), samples)
    if result is None:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "voice cloning provider did not return a voice")
    voice = CustomVoice(
        user_id=user.id,
        name=name.strip(),
        provider=result.provider,
        external_voice_id=result.external_id,
        status=result.status,
        consent_attested=True,
        sample_count=len(samples),
        preview_url=result.preview_url,
    )
    return state.custom_voices.add(voice)


@router.get("/voices/custom", response_model=list[CustomVoice])
def list_custom_voices(user: CurrentUser, state: StateDep) -> list[CustomVoice]:
    """The user's cloned voices — assign one to a persona via its external_voice_id."""
    return sorted(
        state.custom_voices.find(user_id=user.id), key=lambda v: v.created_at, reverse=True
    )


@router.delete("/voices/custom/{voice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_voice(voice_id: str, user: CurrentUser, state: StateDep) -> None:
    """Delete a cloned voice (also removes it at the provider)."""
    voice = state.custom_voices.get(voice_id)
    if voice is None or voice.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "custom voice not found")
    if voice.external_voice_id:
        state.voice_clone.delete(voice.external_voice_id)
    state.custom_voices.delete(voice.id)
