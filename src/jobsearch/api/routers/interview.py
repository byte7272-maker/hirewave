"""Interview prep — suggest questions with résumé-grounded answers."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AvatarVideoRequest,
    InterviewPrepRequest,
    MockInterviewReplyRequest,
    MockInterviewStartRequest,
    TtsRequest,
    VocabularyRequest,
)
from jobsearch.models import (
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
    InterviewPrep,
    MockInterviewSession,
    SessionStatus,
    UserProfile,
    VocabularyAnalysis,
)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])


@router.post("/prep", response_model=InterviewPrep, status_code=status.HTTP_201_CREATED)
def generate_prep(
    body: InterviewPrepRequest, user: CurrentUser, state: StateDep
) -> InterviewPrep:
    """Generate likely interview questions + suggested answers.

    Answers are grounded in the selected résumé's text (an uploaded PDF/DOCX,
    or a generated résumé) when available, otherwise the structured profile.
    Optionally tailored to a target job posting.
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

    return state.interview.generate(profile, resume=resume, job=job, count=body.count)


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
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "voice source did not return audio")
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
