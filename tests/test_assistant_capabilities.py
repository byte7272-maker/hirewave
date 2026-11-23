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
              "speak_on_update", "narrate_values", "error_aware",
              "one_source_of_truth",
              # P286: reversible edits apply + Undo instead of prompting; pane auto-sizes
              # to content (no pulsing arrows / hidden-scroll)
              "undo_over_confirm", "autosize_to_content",
              # core spatial behaviors (P254): point to the focus, don't cover it
              "point_to_focus", "avoid_occlusion",
              # reasoning + bulked consent (P255)
              "reason_and_bulk_consent",
              # pacing + never-go-silent (P257)
              "pace_control", "confirm_task_boundary",
              # badge-first default interaction (P258)
              "badge_first"):
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
             "status_report", "sync_documents", "web_search",
             # P275 within-document actions (jump/highlight a section/keyword; web-refresh a metric)
             "focus_document", "refresh_metric", "review_summary", "review_document"}
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
             "status_report", "sync_documents",
             # P275/P276: within-document focus/highlight, web-refresh a metric, read a bullet,
             # review the summary
             "focus_document", "refresh_metric", "read_bullets", "review_summary", "review_document"}
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


def test_documents_arrival_centers_whole_document_and_maps_sections():
    # P275: on arrival the assistant centers the WHOLE document and reads its section map —
    # it does not drop into a bullet pane or ask "what would you like to do here?".
    # P290: the editor is the SINGLE render surface — no separate Documents-section preview.
    docs = caps.for_section("documents")
    # Opens at the TOP, then focus follows the work (and keeps the worked paragraph in view).
    assert docs["arrival"] == {
        "surface": "editor", "single_render": True,
        "start": "top", "focus_follows_work": True, "keep_focus_in_view": True,
        "map": True, "show_section_list": False,
        "read_along": True, "point_at_active_line": True, "highlight_spoken_words": True,
        "word_sync": "audio_currenttime", "word_sync_no_timer": True,
        "word_weight": "length_plus_pause",
        "narration": {
            "whole_line_one_call": True, "schedule_from_spoken_text": True,
            "no_split_inside_number": True, "never_silent": True, "guard_nan_duration": True,
            "queue": {
                "prefetch_next": True, "advance_on_ended": True,
                "wait_for_cold_fetch": True, "never_drop_queue": True},
            "acronyms_as_letters": True, "use_speak_text": True,
            "options": {
                "narrate_each": True, "highlight_each": True, "point_at_current": True,
                "announce_count": True, "number_options": True, "pause_between": True,
                "pick_or_edit_each": True},
            "intro_by_line_type": {
                "summary": "Your summary reads:", "headline": "Your headline reads:",
                "header": "Your headline reads:", "experience": "This bullet reads:",
                "skills": "This line reads:", "education": "This line reads:",
                "projects": "This bullet reads:", "bullet": "This bullet reads:",
                "paragraph": "This paragraph reads:", "cover_letter": "This paragraph reads:",
                "default": "This line reads:"}},
        "announce": "whole_document"}
    # a single line is ONE TTS call, scheduled from the spoken text, and never goes silent
    narr = docs["arrival"]["narration"]
    assert narr["whole_line_one_call"] and narr["schedule_from_spoken_text"]
    assert narr["never_silent"] and narr["no_split_inside_number"]
    # the lead-in matches the line type — the summary is not "a bullet"
    intro = narr["intro_by_line_type"]
    assert intro["summary"] == "Your summary reads:" and intro["experience"] == "This bullet reads:"
    assert intro["headline"] == "Your headline reads:" and intro["default"] == "This line reads:"
    # replacement options are READ aloud in turn, each highlighted and pointed at
    opts = narr["options"]
    assert opts["narrate_each"] and opts["highlight_each"] and opts["point_at_current"]
    assert opts["number_options"] and opts["pick_or_edit_each"]
    # declared as a first-class behavior too
    assert "narrate_options" in caps.manifest()["behaviors"]
    # the multi-clip queue is robust to a cold fetch (no silence after the first clip), and
    # acronyms are spoken by their letters
    assert narr["queue"]["prefetch_next"] and narr["queue"]["never_drop_queue"]
    assert narr["queue"]["wait_for_cold_fetch"] and narr["acronyms_as_letters"]
    # the section map drives the assistant's focus but is NOT rendered as a clutter list
    assert docs["arrival"]["show_section_list"] is False and docs["arrival"]["map"] is True
    # follow-along is mandatory: read-along + pointer + spoken-word highlight
    assert docs["arrival"]["read_along"] and docs["arrival"]["point_at_active_line"]
    # word highlight follows the AUDIO clock, never a free-running timer (fixes the drift)
    assert docs["arrival"]["word_sync"] == "audio_currenttime"
    assert docs["arrival"]["word_sync_no_timer"] is True
    data = docs["data"]
    assert data["map_resume"].endswith("/map") and data["locate"].endswith("/locate")
    assert data["refresh_metric"].endswith("/refresh-metric")
    # the first step narrates the whole document + its sections, highlighting the Document
    assert docs["steps"][0]["highlight"] == "Document"
    assert "section" in docs["steps"][0]["say"].lower()


def test_documents_bullet_workbench_makes_real_improvements():
    # The bullet workbench is where a SINGLE bullet is worked — read it, then reword/rephrase/
    # fold in a highlight/refresh its figures — explicitly NOT a copy of the bullet list.
    docs = caps.for_section("documents")
    controls = {c["label"]: c["does"].lower() for c in docs["controls"]}
    assert "Bullet workbench" in controls, controls.keys()
    does = controls["Bullet workbench"]
    for cue in ("reword", "rephrase", "refresh", "read", "draft"):
        assert cue in does, (cue, does)
    assert "not a copy" in does or "not a" in does
    # the document itself is centered + editable; section navigation is first-class
    assert "centered" in controls["Document"] and "edit" in controls["Document"]
    assert "Section map" in controls
    assert any(st["highlight"] == "Bullet workbench" for st in docs["steps"])


def test_documents_selected_line_offers_strong_chips_not_clutter():
    # The chips for the currently selected line are the genuinely useful moves, in priority
    # order — make it stronger, add a number, make it concise, refresh figures, tailor, edit
    # it myself, read along — not weak clutter like "fold in a work highlight" as a headline.
    docs = caps.for_section("documents")
    labels = [a["label"] for a in docs["line_actions"]]
    assert labels[:3] == ["Make it stronger", "Add a number", "Make it concise"]
    assert "Edit it myself" in labels and "Read it with me" in labels
    assert "Fold in a work highlight" not in labels
    # the editable chip ties to the edit-before-accept contract
    edit = next(a for a in docs["line_actions"] if a["label"] == "Edit it myself")
    assert edit["slots"].get("editable") is True
    # figure/tailor chips are conditional (only when relevant)
    refresh = next(a for a in docs["line_actions"] if a["label"] == "Refresh the figures")
    assert refresh["slots"].get("when") == "has_dated_metric"
    # exposed through arrival_brief for the client
    assert caps.arrival_brief("documents")["line_actions"] == docs["line_actions"]


def test_documents_refresh_figures_control_and_work_highlights_is_a_separate_page():
    # P286: stale figures refresh from the web (apply + Undo); Work Highlights is NOT a
    # default-pane control any more — it's a separate page.
    docs = caps.for_section("documents")
    controls = {c["label"]: c["does"].lower() for c in docs["controls"]}
    assert "Refresh figures" in controls and "My Work Highlights" not in controls
    refresh = controls["Refresh figures"]
    assert "web" in refresh and ("undo" in refresh or "accept" in refresh or "reject" in refresh)
    # the default pane no longer offers "Ask AI" (the assistant IS the AI, working in the pane)
    assert "Ask AI" not in controls
    # Work Highlights moved to a separate page
    pages = {p["label"]: p for p in docs.get("pages", [])}
    assert "Work Highlights" in pages and pages["Work Highlights"]["view"] == "work_highlights"
    assert "paste" in pages["Work Highlights"]["does"].lower()
    assert any(st["highlight"] == "Refresh figures" for st in docs["steps"])


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


def test_surface_contract_puts_everything_in_the_right_pane():
    # P279: the assistant's home + results live in the docked right pane; only the compact
    # badge floats; results never surface at the top of the page or as a random popout.
    m = caps.manifest()
    s = m["surface"]
    assert s["home"] == "right_pane" and s["expanded_window"] == "right_pane"
    assert s["results"] == "right_pane" and s["floating"] == "badge_only"
    assert s["collapse_main_on_result"] is True
    # The text input is pinned to the top of the pane, always visible, no duplicate functions.
    assert s["input"] == "pinned_top" and s["input_always_visible"] is True
    assert s["no_duplicate_functions"] is True
    # The same right-pane surface applies on every page; the badge opens that pane.
    assert s["consistent_across_pages"] is True and s["badge_opens"] == "right_pane"
    assert {"top_of_page", "random_popout", "obstruct_content", "hidden_input",
            "click_to_summon_input", "duplicate_functions", "confined_inline_box",
            "box_next_to_badge", "different_surface_per_page"} <= set(s["never"])
    for b in ("dock_right_pane", "results_in_right_pane", "badge_only_floats"):
        assert b in m["behaviors"]
    # Voice input shows a LIVE audio meter driven by the mic analyser, and the status tracks
    # the live track (never "mic off" while a track is live) — not a static/unconsumed meter.
    mic = s["mic"]
    assert mic["audio_meter"] and mic["meter_from_analyser"] and mic["meter_live_while_listening"]
    assert mic["status_reflects_live_track"] is True
    assert {"static_meter", "unconsumed_analyser", "off_while_track_live"} <= set(mic["never"])
    # press-to-talk only: never keep listening to ambient and submit it as a command
    assert mic["press_to_talk_only"] and mic["stop_on_release"]
    assert mic["discard_unheld_results"] and mic["discard_low_confidence"]
    assert {"continuous_ambient_capture", "submit_unheld_transcript", "command_from_noise"} \
        <= set(mic["never"])
    # affirming a yes/no offer runs the action directly — no second "Yes, search" consent
    assert s["offer_yes_executes"] is True
    assert {"double_confirm_offer", "second_consent_after_yes"} <= set(s["never"])


def test_summary_review_flow_understands_lists_weaknesses_and_keeps_fresh():
    # P276: the summary flow reads what it says, walks each weakness with its fix, proposes a
    # rewrite, and has a fresh branch — the right-pane, badge-narrated activity.
    m = caps.manifest()
    assert "understand_summary" in m["behaviors"] and "keep_summary_fresh" in m["behaviors"]
    sr = m["flows"]["summary_review"]
    for state in ("start", "understanding", "stale", "weaknesses", "weakness",
                  "proposing", "applying", "fresh", "error"):
        assert sr["speak"].get(state), (state, sr)
    assert sr["ask"] == "proposing" and sr["focus"]
    # it understands (reads_as), walks each finding (title/detail/fix), and proposes a rewrite
    assert "{reads_as}" in sr["speak"]["understanding"]
    for ph in ("{title}", "{detail}", "{fix}"):
        assert ph in sr["speak"]["weakness"]
    assert "{suggestion}" in sr["speak"]["proposing"] and sr["speak"]["proposing"].rstrip().endswith("?")
    # the documents section exposes the control, action, offer and endpoint
    docs = caps.for_section("documents")
    assert "Summary health" in {c["label"] for c in docs["controls"]}
    assert any(a["intent"] == "review_summary" for a in docs["actions"])
    assert any((o.get("on_yes") or {}).get("intent") == "review_summary" for o in docs["offers"])
    assert docs["data"]["summary_review"].endswith("/summary-review")


def test_metric_refresh_flow_reads_findings_and_reasoning():
    # P275: the stale-figure refresh flow flags the dated bullet, narrates planning/searching/
    # reading, reads the reasoning aloud, and proposes a reviewable updated bullet.
    mr = caps.manifest()["flows"]["metric_refresh"]
    for state in ("flagged", "planning", "searching", "reading", "found", "proposing",
                  "applying", "not_found", "error"):
        assert mr["speak"].get(state), (state, mr)
    assert mr["ask"] == "proposing" and mr["focus"]
    # it asks before applying, reads its reasoning, and fills the proposed draft
    assert mr["speak"]["flagged"].rstrip().endswith("?")
    assert mr["speak"]["proposing"].rstrip().endswith("?")
    assert "{reasoning}" in mr["speak"]["found"] and "{draft}" in mr["speak"]["proposing"]
    assert "{period}" in mr["speak"]["flagged"]
