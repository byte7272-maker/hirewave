"""Assistant NLU — POST /api/v1/assistant/interpret + the pure matcher.

The deterministic path covers the whole command set with no LLM; references like
"that one" resolve against the on-screen options; interpretation never executes.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant.intent import IntentResult, interpret


# --- pure matcher -----------------------------------------------------------

@pytest.mark.parametrize("utterance,intent", [
    ("stop", "stop"),
    ("pause", "pause"),
    ("next", "next"),
    ("go back", "back"),
    ("say that again", "repeat"),
    ("cancel", "cancel"),
    ("never mind", "cancel"),
    ("yes please", "confirm"),
    ("do it", "confirm"),
    ("no thanks", "decline"),
    ("what can I do", "read_options"),
    ("read the bullets", "read_bullets"),
    ("which one should I use", "suggest_bullets"),
    ("talk slower", "set_rate"),
])
def test_deterministic_commands(utterance, intent):
    assert interpret(utterance).intent == intent


@pytest.mark.parametrize("utterance,intent", [
    ("check if my microphone is connected", "check_mic"),
    ("is my mic working", "check_mic"),
    ("test my microphone", "check_mic"),
    ("troubleshoot my mic", "check_mic"),
    ("you can't hear me", "check_mic"),
    ("check my audio", "check_audio"),
    ("check my speakers", "check_audio"),
    ("test my speakers", "check_audio"),
    ("run a hardware check", "check_audio"),
    ("I can't hear you", "check_audio"),
    ("there's no sound", "check_audio"),
    ("give me a status report", "status_report"),
    ("how am I doing", "status_report"),
    ("what's changed since last login", "whats_new"),
    ("what did I miss", "whats_new"),
    ("pick up where I left off", "resume_task"),
    ("continue where I left off", "resume_task"),
])
def test_new_capability_intents(utterance, intent):
    assert interpret(utterance).intent == intent


def test_resume_the_document_still_navigates_not_resume_task():
    # "my resume" is the document; only verb phrases map to resume_task.
    assert interpret("take me to my resume").intent == "navigate"
    assert interpret("take me to my resume").slots["section"] == "documents"
    assert interpret("open my resume").slots["section"] == "documents"


def test_navigate_sections():
    assert interpret("take me to my matches").intent == "navigate"
    assert interpret("take me to my matches").slots["section"] == "matches"
    assert interpret("go to auto apply").slots["section"] == "auto_apply"
    assert interpret("open my documents").slots["section"] == "documents"


def test_start_playbook():
    r = interpret("set up auto apply")
    assert r.intent == "start_playbook" and r.slots["playbook"] == "auto_apply"
    assert interpret("connect my email").slots["playbook"] == "connect_source"
    assert interpret("walk through my matches").slots["playbook"] == "walk_matches"


def test_set_rate_direction_and_value():
    assert interpret("faster").slots == {"direction": "faster"}
    assert interpret("set the speed to 1.5").slots == {"rate": 1.5}


def test_change_voice_captures_name():
    r = interpret("switch to the coral voice")
    assert r.intent == "change_voice"
    assert r.slots.get("voice") == "coral"


def test_use_that_one_resolves_focused_option():
    ctx = {"focused_index": 1, "options": [
        {"id": "b0", "label": "Led a team of 8"},
        {"id": "b1", "label": "Cut cloud spend 30%"},
    ]}
    r = interpret("use that one", context=ctx)
    assert r.intent == "use_bullet"
    assert r.slots["option_id"] == "b1" and r.slots["index"] == 1


def test_use_ordinal_resolves_option():
    ctx = {"options": [{"id": "b0", "label": "A"}, {"id": "b1", "label": "B"}, {"id": "b2", "label": "C"}]}
    r = interpret("use the second one", context=ctx)
    assert r.intent == "use_bullet" and r.slots["option_id"] == "b1"


def test_use_that_one_ambiguous_asks_to_disambiguate():
    ctx = {"options": [{"id": "b0", "label": "A"}, {"id": "b1", "label": "B"}]}  # no focused_index
    r = interpret("use that one", context=ctx)
    assert r.intent == "use_bullet"
    assert [o["id"] for o in r.needs_disambiguation] == ["b0", "b1"]


def test_choose_by_label():
    ctx = {"options": [{"id": "b0", "label": "Led a team of eight engineers"},
                       {"id": "b1", "label": "Cut cloud spend thirty percent"}]}
    r = interpret("the one about cloud spend", context=ctx)
    assert r.intent == "choose" and r.slots["option_id"] == "b1"


def test_freeform_becomes_ask():
    r = interpret("make my summary punchier")
    assert r.intent == "ask" and r.slots["query"] == "make my summary punchier"


def test_empty_is_unknown():
    assert interpret("").intent == "unknown"
    assert interpret("   ").intent == "unknown"


def test_llm_backstop_used_only_when_deterministic_is_weak():
    class FakeLLM:
        calls = 0

        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            FakeLLM.calls += 1
            return '{"intent": "navigate", "confidence": 0.8, "slots": {"section": "interview"}}'

    llm = FakeLLM()
    # A clear command must NOT reach the LLM.
    interpret("stop", llm=llm)
    assert FakeLLM.calls == 0
    # An opaque phrase falls through to the backstop.
    r = interpret("zxcv qwerty", llm=llm)
    assert FakeLLM.calls == 1 and r.intent == "navigate" and r.slots["section"] == "interview"


def test_llm_failure_never_raises():
    class BoomLLM:
        def complete(self, *a, **k):
            raise RuntimeError("down")

    r = interpret("asdf lkjh", llm=BoomLLM())  # 2 words → ask fallback, no raise
    assert isinstance(r, IntentResult) and r.intent in ("ask", "unknown")


# --- endpoint ---------------------------------------------------------------

def _client():
    return TestClient(create_app(state=AppState()))


def _auth(client, email="nlu@demo.com"):
    client.post("/api/v1/auth/register",
                json={"email": email, "password": "supersecret12", "full_name": "N"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": email, "password": "supersecret12"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_interpret_endpoint_classifies():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/assistant/interpret", headers=h,
                    json={"transcript": "take me to my matches"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "navigate" and body["slots"]["section"] == "matches"
    assert body["utterance"] == "take me to my matches"


def test_interpret_endpoint_resolves_use_that_one():
    client = _client()
    h = _auth(client, email="nlu2@demo.com")
    r = client.post("/api/v1/assistant/interpret", headers=h, json={
        "transcript": "use that one",
        "context": {"focused_index": 0, "options": [{"id": "x1", "label": "First bullet"}]},
    })
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] == "use_bullet" and body["slots"]["option_id"] == "x1"


def test_interpret_requires_auth():
    client = _client()
    r = client.post("/api/v1/assistant/interpret", json={"transcript": "stop"})
    assert r.status_code in (401, 403)
