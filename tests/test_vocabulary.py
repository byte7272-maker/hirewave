"""Vocabulary analyzer engine + API (recorded / live-transcribed answers)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import VocabularyAnalyzer


# --- engine -----------------------------------------------------------------
def test_empty_text_is_safe():
    a = VocabularyAnalyzer().analyze("   ")
    assert a.word_count == 0
    assert a.suggestions == []
    assert "No speech" in a.summary


def test_flags_filler_words_and_phrases():
    a = VocabularyAnalyzer().analyze(
        "Um, you know, I basically just kind of worked on the thing, honestly."
    )
    kinds = {s.original: s for s in a.suggestions}
    assert "um" in kinds and kinds["um"].kind == "filler"
    assert "you know" in kinds and kinds["you know"].kind == "filler"
    assert "basically" in kinds
    assert a.filler_count >= 3
    assert 0 < a.filler_ratio <= 1


def test_weak_words_get_stronger_alternatives():
    a = VocabularyAnalyzer().analyze("I was responsible for the launch and helped the team.")
    weak = {s.original: s for s in a.suggestions if s.kind == "weak"}
    assert "responsible for" in weak
    assert weak["responsible for"].suggestions  # has replacement verbs
    assert "owned" in weak["responsible for"].suggestions


def test_overused_word_detected():
    text = "data " * 10 + "pipeline analytics reporting dashboards metrics insights"
    a = VocabularyAnalyzer().analyze(text)
    overused = [s for s in a.suggestions if s.kind == "overused"]
    assert any(s.original == "data" for s in overused)


def test_strong_answer_scores_high():
    text = (
        "I led the migration of our billing platform to a distributed architecture, "
        "reducing latency by forty percent while mentoring three engineers through "
        "the transition and coordinating closely with product stakeholders."
    )
    a = VocabularyAnalyzer().analyze(text)
    assert a.score >= 80
    assert a.vocabulary_richness > 0.5


def test_filler_heavy_answer_scores_lower_than_clean():
    filler = VocabularyAnalyzer().analyze(
        "Um, so like, I basically just, you know, kind of did some stuff, honestly, really."
    )
    clean = VocabularyAnalyzer().analyze(
        "I delivered the release, resolved the outage, and documented the runbook."
    )
    assert filler.score < clean.score


# --- speaking pace (live practice pause) ------------------------------------
def _sentence(n: int) -> str:
    # n distinct-ish content words so pace math has enough signal.
    return " ".join(f"point{i}" for i in range(n))


def test_pace_unknown_without_elapsed():
    a = VocabularyAnalyzer().analyze(_sentence(30))
    assert a.words_per_minute == 0.0 and a.pace == ""


def test_pace_steady_in_the_sweet_spot():
    # 30 words in 13s -> ~138 wpm -> steady.
    a = VocabularyAnalyzer().analyze(_sentence(30), elapsed_seconds=13)
    assert a.pace == "steady"
    assert 130 <= a.words_per_minute <= 145


def test_pace_rushed_when_too_fast():
    # 60 words in 15s -> 240 wpm -> rushed, and the summary nudges to slow down.
    a = VocabularyAnalyzer().analyze(_sentence(60), elapsed_seconds=15)
    assert a.pace == "rushed"
    assert "slow down" in a.summary.lower()


def test_pace_slow_when_dragging():
    # 15 words in 20s -> 45 wpm -> slow.
    a = VocabularyAnalyzer().analyze(_sentence(15), elapsed_seconds=20)
    assert a.pace == "slow"


def test_pace_ignored_for_tiny_or_instant_snippets():
    assert VocabularyAnalyzer().analyze("hello there friend", elapsed_seconds=10).pace == ""  # <8 words
    assert VocabularyAnalyzer().analyze(_sentence(20), elapsed_seconds=1).pace == ""  # <3s


# --- API --------------------------------------------------------------------
def _auth(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "voc@demo.com", "password": "supersecret12", "full_name": "Voc"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": "voc@demo.com", "password": "supersecret12"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_vocabulary_endpoint():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/vocabulary",
        headers=h,
        json={"text": "Um, I was responsible for the thing and helped a lot."},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["word_count"] > 0
    assert 0 <= body["score"] <= 100
    assert any(s["kind"] == "filler" for s in body["suggestions"])
    assert any(s["kind"] == "weak" for s in body["suggestions"])
    assert body["summary"]


def test_api_vocabulary_pace_when_elapsed_passed():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    r = client.post(
        "/api/v1/interview/vocabulary",
        headers=h,
        json={"text": " ".join(f"topic{i}" for i in range(40)), "elapsed_seconds": 12},
    )
    body = r.json()
    assert body["pace"] in {"slow", "steady", "fast", "rushed"}
    assert body["words_per_minute"] > 0


def test_api_vocabulary_requires_auth():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    r = client.post("/api/v1/interview/vocabulary", json={"text": "hello world"})
    assert r.status_code == 401
