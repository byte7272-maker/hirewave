"""Assistant capability manifest: structure, generic-behavior derivation, NLU alignment,
and the GET /assistant/capabilities endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant import capabilities as caps
from jobsearch.engines.assistant.intent import _SECTIONS, interpret
from jobsearch.engines.integration import MockTokenExchanger


# --- manifest (pure) --------------------------------------------------------
def test_manifest_shape_and_behaviors():
    m = caps.manifest()
    assert m["version"] == caps.VERSION
    # the generic behaviors every feature inherits are advertised
    for b in ("guide_on_arrival", "pending_offer", "confirm_destructive",
              "speak_on_update", "surface_choices", "narrate_values", "error_aware",
              "one_source_of_truth"):
        assert b in m["behaviors"]
    assert m["sections"] and all("purpose" in s and "actions" in s for s in m["sections"])
    # the full keyword/intent catalog is present and every entry is a real command
    assert m["catalog"] and all(c["text"] and c["intent"] not in ("unknown", "ask") for c in m["catalog"])


def test_every_section_has_an_arrival_brief():
    # guide-on-arrival works for EVERY section with no feature-specific code.
    for s in ("dashboard", "matches", "documents", "connect", "auto_apply", "interview", "inbox"):
        brief = caps.arrival_brief(s)
        assert brief and brief["purpose"]
        assert brief["can_do"]          # names what you can do here
        assert "offers" in brief        # has next-step offers to arm


def test_destructive_is_derived_from_the_verb():
    # remove/change actions auto-confirm; show/connect/walk don't — no per-action flagging.
    assert caps.is_destructive("remove") and caps.is_destructive("change")
    assert not caps.is_destructive("show") and not caps.is_destructive("walk")
    connect = caps.for_section("connect")
    remove = next(a for a in connect["actions"] if a["verb"] == "remove")
    assert remove["destructive"] and remove["confirm"]


def test_section_aliases_come_from_the_nlu():
    # One vocabulary: the manifest's nav aliases are the SAME as the NLU's section synonyms,
    # so recognition and guidance never diverge.
    for s in ("matches", "documents", "connect"):
        assert set(caps.for_section(s)["aliases"]) == set(_SECTIONS[s])


def test_every_offer_is_bound_to_a_real_action():
    # Every scripted yes/no question the assistant asks must carry an on_yes action it can
    # actually run — so it never asks something (e.g. "want a walkthrough?") it can't action.
    valid = {"navigate", "start_playbook", "research_company", "search_jobs", "save",
             "status_report", "sync_documents", "web_search"}
    playbooks = set(caps.manifest()["playbooks"])
    for s in caps.manifest()["sections"]:
        for o in s.get("offers", []):
            assert o.get("prompt"), (s["section"], o)
            oy = o.get("on_yes") or {}
            assert oy.get("intent") in valid, (s["section"], o)
            if oy["intent"] == "start_playbook":
                assert oy.get("slots", {}).get("playbook") in playbooks, (s["section"], o)


def test_manifest_actions_name_real_intents():
    valid = {"navigate", "start_playbook", "research_company", "search_jobs", "save",
             "status_report", "sync_documents"}
    for s in caps.manifest()["sections"]:
        for a in s["actions"]:
            assert a["intent"] in valid, (s["section"], a)


def test_connect_declares_the_five_source_limit():
    assert caps.for_section("connect").get("limits", {}).get("email_sources") == 5


def test_every_section_has_narratable_steps_matching_its_controls():
    # Every section carries ordered steps (say + highlight) so the generic runtime
    # narrates and highlights them — never a silent page. Each step's highlight must
    # name a real control label in that section.
    for s in caps.manifest()["sections"]:
        steps = s.get("steps", [])
        assert steps, s["section"]
        control_labels = {c["label"] for c in s.get("controls", [])}
        for st in steps:
            assert st.get("say") and st.get("highlight"), (s["section"], st)
            assert st["highlight"] in control_labels, (s["section"], st["highlight"])
    # a step that needs the user to act is flagged to wait (connect sign-in)
    assert any(st.get("wait") for st in caps.for_section("connect")["steps"])


def test_readouts_are_well_formed_and_dashboard_has_the_key_metrics():
    # narrate_values: a section's live values are declared as readouts the runtime speaks
    # and highlights. Every readout carries key/label/source/highlight.
    for s in caps.manifest()["sections"]:
        for r in s.get("readouts", []):
            assert r.get("key") and r.get("label") and r.get("source") and r.get("highlight"), (s["section"], r)
    dash = {r["key"] for r in caps.for_section("dashboard")["readouts"]}
    assert {"matches", "strong", "interviews", "applications"} <= dash


# --- endpoint ---------------------------------------------------------------
def _app():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="cap@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "C"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_capabilities_endpoint_returns_manifest():
    _, c = _app()
    h = _auth(c)
    r = c.get("/api/v1/assistant/capabilities", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["sections"] and "verbs" in body


def test_capabilities_endpoint_one_section():
    _, c = _app()
    h = _auth(c)
    r = c.get("/api/v1/assistant/capabilities", headers=h, params={"section": "matches"})
    assert r.status_code == 200 and r.json()["section"]["section"] == "matches"
    assert c.get("/api/v1/assistant/capabilities", headers=h, params={"section": "nope"}).status_code == 404


def test_capabilities_requires_auth():
    _, c = _app()
    assert c.get("/api/v1/assistant/capabilities").status_code == 401


def test_documents_bullet_actions_are_assistant_driven():
    # The right pane is assistant-driven: a selected bullet offers remove/move/re-word/
    # replace/update/search — not an inline bullet editor. The document itself is editable.
    docs = caps.for_section("documents")
    controls = {c["label"]: c["does"].lower() for c in docs["controls"]}
    assert "Selected bullet" in controls, controls.keys()
    does = controls["Selected bullet"]
    for verb in ("remove", "move", "re-word", "replace", "update", "search"):
        assert verb in does, (verb, does)
    # the preview is editable (edit happens in the document, not the right pane)
    assert "edit" in controls["Document preview"]
    # a step narrates the selected-bullet capability, highlighting that control
    assert any(st["highlight"] == "Selected bullet" for st in docs["steps"])


def test_documents_right_pane_toggles_and_assistant_reads_data_dumps():
    # The right pane can switch between the Bullets screen and My Work Highlights (large
    # paste / data dumps), and the assistant can use whatever the user pastes there.
    docs = caps.for_section("documents")
    controls = {c["label"]: c["does"].lower() for c in docs["controls"]}
    assert "Right-pane screen" in controls, controls.keys()
    does = controls["Right-pane screen"]
    assert "my work highlights" in does and "bullets" in does
    assert ("paste" in does or "data dump" in does) and "read" in does  # assistant uses the dump
    assert any(st["highlight"] == "Right-pane screen" for st in docs["steps"])


def test_flows_script_every_state_and_answer_anticipated_questions():
    # The assistant speaks a scripted line for every state of a multi-step flow (never a
    # silent spinner) and has spoken answers for the questions a user asks mid-flow (P252).
    m = caps.manifest()
    assert "narrate_flow_steps" in m["behaviors"] and "answer_anticipated" in m["behaviors"]
    flows = m["flows"]
    # the reported-broken flow: bullet Update/Search must narrate start->searching->found->
    # proposing->applying and the not-found/error branches, and name its ask + focus.
    us = flows["bullet_update_search"]
    for state in ("start", "searching", "found", "proposing", "applying", "not_found", "error"):
        assert us["speak"].get(state), (state, us)
    assert us["ask"] == "proposing" and us["focus"]
    # the proposing line poses a yes/no question (mic-ready, P237)
    assert us["speak"]["proposing"].rstrip().endswith("?")
    # placeholders the client fills are present where expected
    assert "{summary}" in us["speak"]["found"] and "{draft}" in us["speak"]["proposing"]
    # anticipated mid-flow questions each have a spoken answer
    faq = m["flow_faq"]
    for q in ("where_from", "accuracy", "what_changed", "can_edit", "undo", "status", "why"):
        assert faq.get(q), q
    # every flow names the state that asks a question and spotlights a single focus
    for name, f in flows.items():
        assert f.get("speak"), name
        assert f.get("ask") in f["speak"], (name, f.get("ask"))
        assert f.get("focus"), name
