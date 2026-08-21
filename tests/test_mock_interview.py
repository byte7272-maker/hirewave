"""Mock interview trainer — rating heuristics, session flow, API, persistence."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import MockInterviewTrainer, rate_answer
from jobsearch.models import InterviewDifficulty, InterviewerStyle, SessionStatus

WEAK = "Um, I just, like, kind of did stuff I guess."
STRONG = "At Acme I cut p95 latency 40% by adding Redis caching and tuning queries."


# --- rating heuristics ------------------------------------------------------
def test_strong_answer_scores_high():
    text = (
        "At Acme I owned our payments service when latency spiked. I profiled the "
        "hot path, added Redis caching, and tuned the queries, which cut p95 latency "
        "by 40% and let us handle 2000 requests per second."
    )
    fb = rate_answer(text, skills=["Redis", "SQL"])
    assert fb.overall >= 75
    assert fb.structure >= 80  # context + action + result
    assert fb.specificity >= 70  # numbers + skill


def test_weak_answer_gets_actionable_improvements():
    fb = rate_answer("Um, I think I'm just, like, kind of good at that stuff I guess.")
    assert fb.overall < 55
    assert fb.confidence < 70  # lots of hedging
    text = " ".join(fb.improvements).lower()
    assert "filler" in text or "result" in text or "context" in text


def test_rambling_answer_dings_conciseness():
    fb = rate_answer("word " * 300)
    assert fb.conciseness <= 60


# --- session flow -----------------------------------------------------------
def test_start_session_creates_persona_and_opens(profile, matching_job):
    session = MockInterviewTrainer().start_session(
        profile, job=matching_job, style=InterviewerStyle.TECHNICAL, max_questions=3
    )
    assert session.persona.name and session.persona.initials
    assert session.persona.style == InterviewerStyle.TECHNICAL
    assert session.persona.company == matching_job.company
    # Presentation hints drive the on-screen avatar + natural-voice selection.
    assert session.persona.gender in {"female", "male", "neutral"}
    assert session.persona.voice == "crisp"  # technical style → crisp tone
    assert session.asked == 1
    assert session.turns[0].speaker == "interviewer"
    assert session.turns[0].question  # opening asks the first question


def test_persona_presentation_is_deterministic(profile, matching_job):
    # Same inputs → same interviewer identity (name, face-driving gender, voice),
    # so a session and its history render a consistent person.
    trainer = MockInterviewTrainer()
    a = trainer.create_persona(job=matching_job, style=InterviewerStyle.FRIENDLY)
    b = trainer.create_persona(job=matching_job, style=InterviewerStyle.FRIENDLY)
    assert (a.name, a.gender, a.voice) == (b.name, b.gender, b.voice)
    assert a.voice == "warm"  # friendly style → warm tone


def test_reply_rates_and_follows_up(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(profile, job=matching_job, max_questions=3)
    trainer.reply(
        session, profile, "At Acme I led a migration that cut costs by 30%.",
        job=matching_job, response_seconds=42.0,
    )

    candidate_turns = [t for t in session.turns if t.speaker == "candidate"]
    assert len(candidate_turns) == 1
    assert candidate_turns[0].feedback is not None  # answer was rated
    assert candidate_turns[0].response_seconds == 42.0  # timing recorded
    # An interviewer follow-up was appended and progression advanced.
    assert session.turns[-1].speaker == "interviewer"
    assert session.asked == 2
    assert session.status == SessionStatus.ACTIVE


def test_session_completes_with_summary(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(profile, job=matching_job, max_questions=2)
    trainer.reply(session, profile, "First answer with a result: improved uptime to 99.9%.",
                  job=matching_job, response_seconds=30.0)
    trainer.reply(session, profile, "Second answer describing my role at Acme in detail.",
                  job=matching_job, response_seconds=50.0)

    assert session.status == SessionStatus.COMPLETED
    assert session.summary is not None
    assert session.summary.answers_rated == 2
    assert 0 <= session.summary.overall <= 100
    assert session.summary.avg_response_seconds == 40.0  # (30 + 50) / 2
    # Closing interviewer turn, no further question.
    assert session.turns[-1].speaker == "interviewer"


# --- adaptive difficulty ----------------------------------------------------
def test_weak_answer_triggers_followup_on_challenging_persona(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(
        profile, job=matching_job, style=InterviewerStyle.SKEPTICAL,
        difficulty=InterviewDifficulty.NORMAL, max_questions=3,
    )
    asked_before = session.asked
    trainer.reply(session, profile, WEAK, job=matching_job)
    # A probing follow-up was asked on the SAME question (asked did not advance).
    assert session.asked == asked_before
    assert session.followups_this_q == 1
    assert session.turns[-1].speaker == "interviewer" and session.turns[-1].question


def test_easy_mode_never_follows_up(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(
        profile, job=matching_job, style=InterviewerStyle.SKEPTICAL,
        difficulty=InterviewDifficulty.EASY, max_questions=3,
    )
    trainer.reply(session, profile, WEAK, job=matching_job)
    assert session.asked == 2  # advanced straight to the next question
    assert session.followups_this_q == 0


def test_strong_answer_advances_without_followup(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(
        profile, job=matching_job, style=InterviewerStyle.SKEPTICAL,
        difficulty=InterviewDifficulty.NORMAL, max_questions=3,
    )
    trainer.reply(session, profile, STRONG, job=matching_job)
    assert session.asked == 2  # good answer -> move on


def test_followup_capped_then_advances(profile, matching_job):
    trainer = MockInterviewTrainer()
    session = trainer.start_session(
        profile, job=matching_job, style=InterviewerStyle.SKEPTICAL,
        difficulty=InterviewDifficulty.NORMAL, max_questions=3,
    )
    trainer.reply(session, profile, WEAK, job=matching_job)  # -> follow-up
    assert session.followups_this_q == 1
    trainer.reply(session, profile, WEAK, job=matching_job)  # cap hit -> advance
    assert session.asked == 2
    assert session.followups_this_q == 0


# --- API + persistence ------------------------------------------------------
def _client(settings=None):
    return TestClient(
        create_app(state=AppState(settings=settings or Settings(), exchanger=MockTokenExchanger()))
    )


def _auth(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "sam@demo.com", "password": "supersecret", "full_name": "Sam"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_full_mock_interview():
    client = _client()
    h = _auth(client)
    client.put("/api/v1/users/me", headers=h, json={"skills": ["Python", "FastAPI"]})

    start = client.post(
        "/api/v1/interview/mock/start",
        headers=h,
        json={"style": "skeptical", "max_questions": 2},
    )
    assert start.status_code == 201
    session = start.json()
    assert session["persona"]["style"] == "skeptical"
    assert session["turns"][0]["speaker"] == "interviewer"
    sid = session["id"]

    # Answer 1.
    r1 = client.post(
        f"/api/v1/interview/mock/{sid}/reply",
        headers=h,
        json={"answer": "At Acme I cut build times by 50% by parallelizing the pipeline."},
    ).json()
    assert r1["turns"][1]["speaker"] == "candidate"
    assert r1["turns"][1]["feedback"]["overall"] > 0

    # Answer 2 -> completes with a summary.
    r2 = client.post(
        f"/api/v1/interview/mock/{sid}/reply",
        headers=h,
        json={"answer": "I mentored two engineers and shipped the search revamp on time."},
    ).json()
    assert r2["status"] == "completed"
    assert r2["summary"]["answers_rated"] == 2

    # Replying to a completed session is rejected.
    assert (
        client.post(
            f"/api/v1/interview/mock/{sid}/reply", headers=h, json={"answer": "more"}
        ).status_code
        == 409
    )

    # Persisted + listable + owner-scoped.
    assert client.get(f"/api/v1/interview/mock/{sid}", headers=h).status_code == 200
    assert len(client.get("/api/v1/interview/mock", headers=h).json()) == 1


def test_reply_to_unknown_session_404():
    client = _client()
    h = _auth(client)
    assert (
        client.post(
            "/api/v1/interview/mock/nope/reply", headers=h, json={"answer": "x"}
        ).status_code
        == 404
    )
