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


def test_connect_email_variants_resolve_to_connect_source():
    # Voice variants that previously fell through (only the exact "connect my email"
    # synonym worked). All should start the connect_source playbook now.
    for phrase in (
        "connect a new email account",
        "add an email account",
        "add a new email address as a source",
        "link my email",
        "set up an email source",
        "connect gmail",
    ):
        r = interpret(phrase)
        assert r.intent == "start_playbook", (phrase, r.intent)
        assert r.slots.get("playbook") == "connect_source", (phrase, r.slots)


def test_email_connect_section_navigates_to_connect_not_inbox():
    # "email" appears in both the inbox and the connect intents; the connect/sources
    # page must win when the user asks for the connect section.
    for phrase in ("bring me to the email connect section",
                   "take me to my email sources",
                   "open connections"):
        r = interpret(phrase)
        assert r.intent == "navigate", (phrase, r.intent)
        assert r.slots["section"] == "connect", (phrase, r.slots)


def test_change_email_on_resume_is_a_document_edit_not_a_source():
    # Replacing the email ADDRESS ON the résumé is a document edit, not connecting a source.
    r = interpret("replace the email address used on the resume")
    assert r.intent == "navigate"
    assert r.slots["section"] == "documents" and r.slots.get("doc") == "resume"
    assert r.slots.get("edit")  # instruction carried for Ask-AI


def test_remove_source_navigates_to_connect_to_manage():
    r = interpret("disconnect my email account")
    assert r.intent == "navigate"
    assert r.slots["section"] == "connect" and r.slots.get("manage") == "remove"


def test_replace_email_address_is_document_edit_not_source():
    # The reported bug: "replace my email address" (no "in my resume") was going to the
    # email CONNECTION source. An email ADDRESS is a contact field -> document edit.
    for phrase in ("replace my email address",
                   "change my email address",
                   "update the email address on my resume"):
        r = interpret(phrase)
        assert r.intent == "navigate", (phrase, r.intent)
        assert r.slots["section"] == "documents", (phrase, r.slots)
        assert r.slots.get("doc") == "resume", (phrase, r.slots)


def test_email_account_vs_address_are_distinguished():
    # "account/source" -> connection; "address" -> document. Same verb, different object.
    assert interpret("change my email source").slots["section"] == "connect"
    assert interpret("change my email address").slots["section"] == "documents"


def test_bare_ambiguous_email_change_asks_which():
    r = interpret("change the email")
    assert r.intent == "ask" and r.slots.get("clarify") == "email_target"
    assert "résumé" in r.reply or "resume" in r.reply


def test_use_email_address_on_resume_is_a_document_edit_not_a_bullet():
    # "use …" normally selects a bullet, but "use a different email address on my resume"
    # is a document edit (was misclassified as use_bullet).
    r = interpret("use a different email address on my resume")
    assert r.intent == "navigate"
    assert r.slots["section"] == "documents" and r.slots.get("doc") == "resume"
    # a real bullet selection still works
    assert interpret("use that one").intent == "use_bullet"


def test_navigate_to_cover_letter_vs_resume_carries_the_doc():
    # "go to my cover letter" must open the COVER LETTER, not just the Documents section
    # (which was defaulting to the résumé).
    r = interpret("go to my cover letter")
    assert r.intent == "navigate"
    assert r.slots["section"] == "documents" and r.slots.get("doc") == "cover_letter"
    assert interpret("show my cover letter").slots.get("doc") == "cover_letter"
    assert interpret("open my resume").slots.get("doc") == "resume"
    # a plain "open my documents" names no specific doc
    assert "doc" not in interpret("open my documents").slots


def test_every_suggested_command_is_understood():
    # The promise behind suggestions: anything the assistant offers, it can parse.
    from jobsearch.engines.assistant.intent import _SUGGESTIONS, suggest_commands
    for screen in ("matches", "documents", "dashboard", "", "job"):
        for s in suggest_commands({"section": screen}, limit=12):
            r = interpret(s["text"])
            assert r.intent not in ("unknown", "ask"), (screen, s["text"], r.intent)
            assert r.intent == s["intent"]
    # the catalog itself is all parseable (no dead examples ship)
    for text, _tags in _SUGGESTIONS:
        assert interpret(text).intent not in ("unknown", "ask"), text


def test_suggestions_are_screen_aware():
    from jobsearch.engines.assistant.intent import suggest_commands
    on_matches = [s["text"].lower() for s in suggest_commands({"section": "matches"}, limit=12)]
    assert any("matches" in t for t in on_matches)
    on_docs = [s["text"].lower() for s in suggest_commands({"section": "documents"}, limit=12)]
    assert any("résumé" in t or "resume" in t or "bullets" in t for t in on_docs)


def test_unknown_utterance_suggests_nearest_understood_wording():
    # A garbled utterance should come back with "did you mean…" wording that parses.
    r = interpret("the matches whatchamacallit thingy", context={"page": "matches"})
    assert r.intent in ("unknown", "ask")
    assert r.suggestions, "an unclear utterance should offer suggestions"
    for s in r.suggestions:
        assert interpret(s["text"]).intent not in ("unknown", "ask")
    # on the matches screen, the nearest wording should surface a matches command
    assert any("match" in s["text"].lower() for s in r.suggestions)


def test_save_this_job_is_a_command():
    assert interpret("save this one for later").intent == "save"
    assert interpret("bookmark it").intent == "save"


def test_clear_command_has_no_suggestions_noise():
    r = interpret("take me to my matches")
    assert r.intent == "navigate" and not r.suggestions  # understood → no "did you mean"


def test_refresh_matches_navigates_not_grand_tour():
    # "refresh my matches" must NOT start the walk_matches playbook (grand tour) —
    # it token-overlaps "review my matches". An explicit refresh verb navigates there.
    for phrase in ("refresh my matches", "reload matches", "refresh matches"):
        r = interpret(phrase)
        assert r.intent == "navigate", (phrase, r.intent)
        assert r.slots["section"] == "matches"
        assert r.slots.get("refresh") is True
    # a plain "review my matches" still walks them
    assert interpret("review my matches").slots["playbook"] == "walk_matches"


def test_rate_my_matches_rates_them_and_does_not_set_voice_speed():
    # the "Rate my matches" quick action must execute (the read-only walk that scores
    # them), not fall through to unknown and do nothing — and "rate" here must NOT be
    # read as a voice-speed command (which needs a number).
    for phrase in ("rate my matches", "score my matches", "rank my matches",
                   "grade my matches", "how good are my matches"):
        r = interpret(phrase)
        assert r.intent == "start_playbook", (phrase, r.intent)
        assert r.slots["playbook"] == "walk_matches", (phrase, r.slots)
    # a genuine voice-speed command with a number still sets the rate
    assert interpret("set the rate to 1.2").slots == {"rate": 1.2}


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


def test_suggestions_endpoint_returns_screen_commands():
    client = _client()
    h = _auth(client, email="sug@demo.com")
    r = client.get("/api/v1/assistant/suggestions", headers=h, params={"section": "matches"})
    assert r.status_code == 200, r.text
    sugg = r.json()["suggestions"]
    assert sugg, "the matches screen should have suggestions"
    assert any("match" in s["text"].lower() for s in sugg)
    # the guarantee: every suggested command round-trips through /interpret as a command
    for s in sugg[:4]:
        ri = client.post("/api/v1/assistant/interpret", headers=h,
                         json={"transcript": s["text"]}).json()
        assert ri["intent"] not in ("unknown", "ask")


def test_interpret_endpoint_offers_suggestions_on_a_miss():
    client = _client()
    h = _auth(client, email="sug2@demo.com")
    r = client.post("/api/v1/assistant/interpret", headers=h, json={
        "transcript": "the matches whatchamacallit thingy", "context": {"page": "matches"}})
    body = r.json()
    assert body["suggestions"], "a miss should come back with wording it understands"
    assert all("text" in s and "intent" in s for s in body["suggestions"])


def test_generic_walk_resolves_to_current_screen():
    """A generic 'walk me through / from the top / start over' with no named target
    must resolve against the CURRENT screen — on Matches it walks the matches, so it
    doesn't fall through to a default route (which had sent it to Documents)."""
    for phrase in ("walk me through from the top", "from the top", "start over",
                   "go through these one by one", "take me through these", "walk me through"):
        r = interpret(phrase, context={"section": "matches"})
        assert r.intent == "start_playbook" and r.slots.get("playbook") == "walk_matches", phrase

    # Off Matches, a bare generic walk doesn't get wrongly routed to the matches walk.
    assert interpret("walk me through from the top", context={"section": "documents"}).intent != "start_playbook"
    assert interpret("walk me through from the top", context={"section": "dashboard"}).intent != "start_playbook"

    # Naming a different target wins over the fuzzy matches-walk match.
    assert interpret("walk me through my resume", context={"section": "matches"}).slots.get("playbook") != "walk_matches"

    # Explicit matches phrasing still works from anywhere.
    assert interpret("walk through my matches", context={"section": "dashboard"}).slots.get("playbook") == "walk_matches"
