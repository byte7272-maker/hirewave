"""Interview prep — suggest questions with résumé-grounded answers."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.models.common import utcnow
from jobsearch.api.schemas import (
    AvatarVideoRequest,
    InterviewPrepRequest,
    MockCoachOut,
    MockInterviewReplyRequest,
    MockInterviewStartRequest,
    PersonaVoiceUpdate,
    SaveAnswerRequest,
    SavedAnswerOut,
    RefineAnswerRequest,
    SuggestAnswerRequest,
    SuggestedAnswerOut,
    TtsRequest,
    VocabularyRequest,
)
from jobsearch.engines.interview import suggested_answer_seconds
from jobsearch.engines.interview.engine import infer_category
from jobsearch.engines.interview.scripts import line_id_for_text
from jobsearch.engines.interview.clip_builder import build_clips, clip_key, status_for
from jobsearch.engines.interview.heygen import build_heygen_client
from jobsearch.models import (
    CustomVoice,
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
    InterviewPrep,
    MockInterviewSession,
    PersonaVoice,
    QuestionCategory,
    SavedAnswer,
    SessionStatus,
    UserProfile,
    VocabularyAnalysis,
    VoiceSource,
)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])


def _static_dir():
    """On-disk directory of bundled static assets (persona photos live here)."""
    from pathlib import Path

    return Path(__file__).resolve().parent.parent.parent / "static"


def _asset_base() -> str:
    """Origin the backend is reached at, for building absolute clip URLs. Matches
    the persona-library asset base so clips and photos share an origin."""
    import os

    return os.environ.get(
        "JOBSEARCH_ASSET_BASE", "https://hirewave-production-3db3.up.railway.app"
    ).rstrip("/")

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
    if resume is None:  # default to the user's most-recent résumé so questions tailor
        mine = [r for r in state.resumes.find(user_id=user.id) if not getattr(r, "archived", False)]
        resume = mine[-1] if mine else None
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


@router.get("/mock/{session_id}/coach", response_model=MockCoachOut)
def coach_mock(session_id: str, user: CurrentUser, state: StateDep) -> MockCoachOut:
    """Guided-practice coaching for the CURRENT interviewer question.

    Powers a practice mode that reads the question aloud, optionally reads a
    model answer, then pauses ``answer_seconds`` for the candidate to respond.
    The model answer is grounded strictly in the user's résumé/profile (never
    fabricated), reusing the same drafting as interview prep."""
    session = _owned_session(session_id, user, state)
    # The current question is the most recent interviewer turn.
    question = next(
        (t.question or t.text for t in reversed(session.turns) if t.speaker == "interviewer"),
        "",
    )
    if not question:
        raise HTTPException(status.HTTP_409_CONFLICT, "no interviewer question to coach yet")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    resume = state.resumes.get(session.resume_id) if session.resume_id else None
    job = state.jobs.get(session.job_posting_id) if session.job_posting_id else None
    coached = state.interview.coach(
        question,
        profile,
        resume=resume,
        job=job,
        experience_context=state.experience.context_text(user.id),
    )
    return MockCoachOut(
        question=coached.question,
        category=coached.category.value,
        model_answer=coached.suggested_answer,
        answer_seconds=suggested_answer_seconds(coached.category),
        tips=coached.tips,
    )


# --- answer suggestions + a personal library -------------------------------
@router.post("/suggest-answer", response_model=SuggestedAnswerOut)
def suggest_answer(
    body: SuggestAnswerRequest, user: CurrentUser, state: StateDep
) -> SuggestedAnswerOut:
    """A brief, résumé-grounded suggested answer to a single question — from
    anywhere (question bank, prep, a custom question), no mock session needed.

    Grounded strictly in the user's résumé/profile + brought-in work highlights,
    so it never fabricates. The UI transcribes it into the card; the user can save
    it to learn effective phrasing and techniques."""
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a question is required")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    resume = state.resumes.get(body.resume_id) if body.resume_id else None
    if body.resume_id and (resume is None or resume.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    if resume is None:
        # Ground in the user's most-recent résumé by default, so the answer isn't a
        # generic placeholder when the caller doesn't pass a specific resume_id.
        mine = [r for r in state.resumes.find(user_id=user.id) if not getattr(r, "archived", False)]
        resume = mine[-1] if mine else None
    job = state.jobs.get(body.job_posting_id) if body.job_posting_id else None
    if body.job_posting_id and job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    coached = state.interview.coach(
        question, profile, resume=resume, job=job,
        experience_context=state.experience.context_text(user.id),
    )
    return SuggestedAnswerOut(
        question=coached.question,
        category=coached.category.value,
        answer=coached.suggested_answer,
        tips=coached.tips,
        answer_seconds=suggested_answer_seconds(coached.category),
    )


@router.post("/refine-answer", response_model=SuggestedAnswerOut)
def refine_answer(
    body: RefineAnswerRequest, user: CurrentUser, state: StateDep
) -> SuggestedAnswerOut:
    """Refine/recalculate an existing suggested answer: apply the user's instruction
    (e.g. 'make it more concise', 'emphasize my leadership') and work in any topics/
    points they want highlighted — staying grounded in their résumé, never invented."""
    question = (body.question or "").strip()
    instruction = (body.instruction or "").strip()
    if not question or not instruction:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a question and an instruction are required")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    resume = state.resumes.get(body.resume_id) if body.resume_id else None
    if body.resume_id and (resume is None or resume.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")
    if resume is None:  # default to the user's most-recent résumé so it stays grounded
        mine = [r for r in state.resumes.find(user_id=user.id) if not getattr(r, "archived", False)]
        resume = mine[-1] if mine else None
    job = state.jobs.get(body.job_posting_id) if body.job_posting_id else None
    if body.job_posting_id and job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job posting not found")
    coached = state.interview.refine(
        question, body.answer, instruction, profile=profile, resume=resume, job=job,
        experience_context=state.experience.context_text(user.id), points=body.points,
    )
    return SuggestedAnswerOut(
        question=coached.question,
        category=coached.category.value,
        answer=coached.suggested_answer,
        tips=coached.tips,
        answer_seconds=suggested_answer_seconds(coached.category),
    )


def _answer_out(a: SavedAnswer) -> SavedAnswerOut:
    return SavedAnswerOut(
        id=a.id, question=a.question, category=a.category.value, answer=a.answer,
        tips=a.tips, source=a.source, resume_id=a.resume_id, job_posting_id=a.job_posting_id,
        created_at=a.created_at.isoformat(), updated_at=a.updated_at.isoformat(),
    )


@router.post("/saved-answers", response_model=SavedAnswerOut, status_code=status.HTTP_201_CREATED)
def save_answer(body: SaveAnswerRequest, user: CurrentUser, state: StateDep) -> SavedAnswerOut:
    """Keep an answer (a suggestion, the user's edit of one, or their own) so it can
    be re-read and printed later to learn good phrasing."""
    if not (body.question or "").strip() or not (body.answer or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "question and answer are required")
    try:
        category = QuestionCategory(body.category) if body.category else infer_category(body.question)
    except ValueError:
        category = infer_category(body.question)
    source = body.source if body.source in ("suggested", "edited", "own") else "suggested"
    saved = SavedAnswer(
        user_id=user.id, question=body.question.strip(), category=category,
        answer=body.answer.strip(), tips=body.tips, source=source,
        resume_id=body.resume_id, job_posting_id=body.job_posting_id,
    )
    return _answer_out(state.saved_answers.add(saved))


@router.get("/saved-answers", response_model=list[SavedAnswerOut])
def list_saved_answers(user: CurrentUser, state: StateDep) -> list[SavedAnswerOut]:
    """The user's saved answers, most recent first (for reading / printing)."""
    answers = sorted(
        state.saved_answers.find(user_id=user.id),
        key=lambda a: a.created_at, reverse=True,
    )
    return [_answer_out(a) for a in answers]


@router.delete("/saved-answers/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_answer(answer_id: str, user: CurrentUser, state: StateDep) -> None:
    a = state.saved_answers.get(answer_id)
    if a is None or a.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "saved answer not found")
    state.saved_answers.delete(answer_id)


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
    to also get an LLM-polished version of the whole answer. Pass
    ``elapsed_seconds`` (a live practice pause) to also get a speaking-pace read.
    """
    return state.vocabulary.analyze(
        body.text, rewrite=body.rewrite, elapsed_seconds=body.elapsed_seconds
    )


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
    """Talking-head clip URL for an interviewer line.

    Prefers a *pre-rendered* clip (HeyGen, built ahead of time) when the line is one
    of the fixed common questions for this persona — that's instant and realistic.
    Otherwise it falls back to a configured live video source, and finally 501 (the
    client then speaks the line with the persona photo + neural TTS)."""
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text is empty")

    # 1) A cached talking-head clip for a fixed question?
    persona_id = str((body.persona or {}).get("id") or "")
    line_id = line_id_for_text(text)
    if persona_id and line_id and state.documents.get(clip_key(persona_id, line_id)) is not None:
        return {"video_url": _clip_url(persona_id, line_id), "source": "prerendered"}

    # 2) A live video provider?
    if state.avatar_video.enabled:
        url = state.avatar_video.render(persona=body.persona, text=text)
        if not url:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "video source did not return a clip")
        return {"video_url": url, "source": "live"}

    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "no neural-video source configured")


# --- pre-rendered interviewer clips (HeyGen talking-head library) ------------
def _clip_url(persona_id: str, line_id: str) -> str:
    """Absolute URL of a stored clip, so the client can use it as a <video> src."""
    return f"{_asset_base()}/api/v1/interview/clip/{persona_id}/{line_id}"


@router.get("/avatars/clips")
def avatar_clip_status(user: CurrentUser, state: StateDep) -> dict:
    """How many persona × fixed-question clips are pre-rendered so far."""
    return status_for(state.persona_library.all(), state.documents)


@router.post("/avatars/build")
def build_avatar_clips(user: CurrentUser, state: StateDep, limit: int = 4) -> dict:
    """Pre-render the fixed interviewer questions as talking-head clips (HeyGen).

    Generates up to ``limit`` missing clips per call so the request can't hang on a
    long render queue — call repeatedly until ``remaining`` is 0. 501 when no HeyGen
    key is configured (set ``HEYGEN_API_KEY`` in the backend)."""
    client = build_heygen_client(state.settings)
    if client is None:
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            "HeyGen is not configured — set HEYGEN_API_KEY in the backend",
        )
    voice = getattr(state.settings, "heygen_voice_id", "")
    if not voice:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "set JOBSEARCH_HEYGEN_VOICE_ID to a HeyGen voice id first",
        )
    return build_clips(
        client,
        state.persona_library.all(),
        state.documents,
        _static_dir(),
        voice_id=voice,
        limit=max(1, min(limit, 50)),
    )


@router.get("/clip/{persona_id}/{line_id}")
def get_avatar_clip(persona_id: str, line_id: str, state: StateDep) -> Response:
    """Serve a pre-rendered talking-head clip (public: generic question video, no
    personal data) so a plain <video src> can play it."""
    stored = state.documents.get(clip_key(persona_id, line_id))
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "clip not rendered")
    data, ctype = stored
    return Response(
        content=data,
        media_type=ctype or "video/mp4",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# --- per-persona voice selection (upload / change voice per persona) ---------
def _persona_or_404(state: StateDep, persona_id: str) -> InterviewerPersona:
    for p in state.persona_library.all():
        if p.id == persona_id:
            return p
    raise HTTPException(status.HTTP_404_NOT_FOUND, "persona not found")


def _voice_id(user_id: str, persona_id: str) -> str:
    return f"{user_id}:{persona_id}"


# Distinct OpenAI TTS voices per built-in persona so they don't all sound alike.
# IMPORTANT: the voice's perceived gender must match the persona's gender/avatar.
# OpenAI voice genders — female: nova, shimmer, coral, sage; male: echo, onyx,
# fable, ash, ballad, verse; neutral/androgynous: alloy. (fable sounds male, so it
# must never be a female persona's voice.)
# Voice per persona — matched to the persona's PHOTO gender, spread across the
# distinct neural voices (female: nova/shimmer/coral/sage · male: onyx/echo/ash).
_OPENAI_GALLERY_VOICE = {
    "Devon Clark": "nova",       # female, warm
    "Maya Patel": "shimmer",     # female, bright
    "Priya Nair": "coral",       # female, expressive
    "Marcus Chen": "onyx",       # male, deep
    "Dr. Elena Rossi": "sage",   # female, gentle
    "Jordan Blake": "nova",      # female, warm
    "Cam Reed": "shimmer",       # female, bright
    "Lina Moreno": "coral",      # female, expressive
    "Mia Torres": "sage",        # female, gentle
    "Jalen Mendez": "echo",      # male, warm
    "Ananya Desai": "nova",      # female, warm
    "Kael Vance": "ash",         # male, firm
}
# Gender fallback for dynamic personas — keyed by the persona's gender/avatar so a
# neutral name never gets an opposite-gender voice.
_OPENAI_BY_GENDER = {"male": "onyx", "female": "nova", "neutral": "alloy"}
# The voices we treat as each gender, so a mapping can be sanity-checked against the
# persona's gender (never serve a male voice to a female persona/avatar, etc.).
_VOICE_GENDER = {
    "nova": "female", "shimmer": "female", "coral": "female", "sage": "female",
    "echo": "male", "onyx": "male", "fable": "male", "ash": "male", "ballad": "male", "verse": "male",
    "alloy": "neutral",
}

# --- the ANSWER voice: a single, user-picked voice for reading the suggested /
# "ideal" answers aloud (separate from the interviewer personas). Kept simple:
# male/female/neutral + a short style label. Stored per user under a sentinel id.
_ANSWER_VOICE_ID = "answer"
_DEFAULT_ANSWER_VOICE = "nova"  # a clear, warm default the user can change in one tap
ANSWER_VOICE_CATALOG = [
    {"voice_id": "echo", "label": "Warm", "gender": "male"},
    {"voice_id": "onyx", "label": "Deep", "gender": "male"},
    {"voice_id": "nova", "label": "Warm", "gender": "female"},
    {"voice_id": "shimmer", "label": "Bright", "gender": "female"},
    {"voice_id": "coral", "label": "Expressive", "gender": "female"},
    {"voice_id": "sage", "label": "Gentle", "gender": "female"},
    {"voice_id": "alloy", "label": "Neutral", "gender": "neutral"},
]
# Default neural voice when the user picks only a gender.
_ANSWER_VOICE_BY_GENDER = {"male": "echo", "female": "nova", "neutral": "alloy"}


def _server_voice_for(persona: InterviewerPersona, settings) -> str:
    """A concrete neural voice id for a persona, so each interviewer sounds
    distinct AND matches the persona's gender/avatar. An explicit persona.voice_id
    always wins; otherwise, when the active TTS provider is OpenAI, map to a distinct
    stock voice by name — but if that voice's gender disagrees with the persona's
    (e.g. a female persona mapped to a male-sounding voice), fall back to a
    gender-appropriate voice so a persona never speaks in the opposite gender."""
    if persona.voice_id:
        return persona.voice_id
    if getattr(settings, "tts_provider", "none") == "openai":
        pg = persona.gender if persona.gender in ("male", "female", "neutral") else "neutral"
        vid = _OPENAI_GALLERY_VOICE.get(persona.name, "")
        # Keep the named voice only when its gender matches the persona/avatar.
        if vid and (pg == "neutral" or _VOICE_GENDER.get(vid) in (pg, "neutral")):
            return vid
        return _OPENAI_BY_GENDER.get(pg, "alloy")
    return ""


def _default_voice(user_id: str, persona: InterviewerPersona, settings=None) -> PersonaVoice:
    """The effective voice when the user hasn't chosen one. Resolves a concrete
    server voice id (distinct per persona) so the client speaks each interviewer
    in a different neural voice instead of one shared default."""
    vid = _server_voice_for(persona, settings) if settings is not None else persona.voice_id
    return PersonaVoice(
        id=_voice_id(user_id, persona.id),
        user_id=user_id,
        persona_id=persona.id,
        source=VoiceSource.SERVER if vid else VoiceSource.BROWSER,
        voice_id=vid,
        lang="en-US",
    )


@router.get("/voices", response_model=list[PersonaVoice])
def list_voice_prefs(user: CurrentUser, state: StateDep) -> list[PersonaVoice]:
    """The EFFECTIVE voice for every persona — the user's saved choice when present,
    otherwise a distinct default derived from the persona (gender/name → a different
    neural voice each). Returning the full set means the client speaks each
    interviewer in its own voice instead of falling back to one shared default when
    nothing is customized."""
    saved = {v.persona_id: v for v in state.persona_voices.find(user_id=user.id)}
    return [
        saved.get(p.id) or _default_voice(user.id, p, state.settings)
        for p in state.persona_library.all()
    ]


@router.get("/answer-voice/catalog")
def answer_voice_catalog(user: CurrentUser, state: StateDep) -> dict:
    """The simple, selectable voices for reading suggested answers aloud, grouped by
    gender with a short style label. ``tts`` says whether neural voices are available
    (else the client uses browser voices)."""
    return {"tts": state.speech.enabled, "voices": ANSWER_VOICE_CATALOG}


def _default_answer_voice(user_id: str, settings) -> PersonaVoice:
    vid = _DEFAULT_ANSWER_VOICE if getattr(settings, "tts_provider", "none") == "openai" else ""
    return PersonaVoice(
        id=_voice_id(user_id, _ANSWER_VOICE_ID), user_id=user_id, persona_id=_ANSWER_VOICE_ID,
        source=VoiceSource.SERVER if vid else VoiceSource.BROWSER, voice_id=vid, lang="en-US",
    )


@router.get("/answer-voice", response_model=PersonaVoice)
def get_answer_voice(user: CurrentUser, state: StateDep) -> PersonaVoice:
    """The user's chosen voice for the suggested-answer readout, or a sensible default."""
    saved = state.persona_voices.get(_voice_id(user.id, _ANSWER_VOICE_ID))
    return saved or _default_answer_voice(user.id, state.settings)


@router.put("/answer-voice", response_model=PersonaVoice)
def set_answer_voice(body: PersonaVoiceUpdate, user: CurrentUser, state: StateDep) -> PersonaVoice:
    """Pick the answer-readout voice. Simplest path: send just ``gender`` (male/
    female/neutral) and we choose a good neural voice; or send an exact ``voice_id``
    from the catalog, or a browser voice (``source: browser`` + ``voice_uri``)."""
    pref = state.persona_voices.get(_voice_id(user.id, _ANSWER_VOICE_ID)) or _default_answer_voice(
        user.id, state.settings)
    data = body.model_dump(exclude_unset=True)
    gender = (data.pop("gender", None) or "").strip().lower()
    if gender and not data.get("voice_id"):
        data["voice_id"] = _ANSWER_VOICE_BY_GENDER.get(gender, _DEFAULT_ANSWER_VOICE)
        data.setdefault("source", "server")
    if data.get("source") is not None:
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
    # A concrete neural voice_id implies a server voice.
    if pref.voice_id and pref.source == VoiceSource.BROWSER and not pref.voice_uri:
        pref.source = VoiceSource.SERVER
    pref.updated_at = utcnow()
    return state.persona_voices.add(pref)


@router.get("/personas/{persona_id}/voice", response_model=PersonaVoice)
def get_voice_pref(persona_id: str, user: CurrentUser, state: StateDep) -> PersonaVoice:
    """The effective voice for one persona — the user's saved choice, or a default
    derived from the persona's gender/tone if they haven't chosen one."""
    persona = _persona_or_404(state, persona_id)
    saved = state.persona_voices.get(_voice_id(user.id, persona_id))
    return saved or _default_voice(user.id, persona, state.settings)


@router.put("/personas/{persona_id}/voice", response_model=PersonaVoice)
def set_voice_pref(
    persona_id: str, body: PersonaVoiceUpdate, user: CurrentUser, state: StateDep
) -> PersonaVoice:
    """Dynamically change a persona's voice: pick a browser voice (voice_uri +
    rate/pitch/lang), or point it at a server neural voice_id."""
    persona = _persona_or_404(state, persona_id)
    pref = state.persona_voices.get(_voice_id(user.id, persona_id)) or _default_voice(
        user.id, persona, state.settings
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
        user.id, persona, state.settings
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
