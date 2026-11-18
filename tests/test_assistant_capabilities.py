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
              "one_source_of_truth",
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
             "focus_document", "refresh_metric", "review_summary"}
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
             "focus_document", "refresh_metric", "read_bullets", "review_summary"}
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
    docs = caps.for_section("documents")
    assert docs["arrival"] == {"center": "document", "map": True, "announce": "whole_document"}
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


def test_documents_refresh_figures_and_highlights_controls():
    # Stale period-bound figures are flagged and refreshable from the web (review/accept/
    # reject), and My Work Highlights still feeds evidence into a bullet.
    docs = caps.for_section("documents")
    controls = {c["label"]: c["does"].lower() for c in docs["controls"]}
    assert "Refresh figures" in controls and "My Work Highlights" in controls
    refresh = controls["Refresh figures"]
    assert "web" in refresh and ("accept" in refresh or "reject" in refresh)
    assert "paste" in controls["My Work Highlights"]
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
    assert {"top_of_page", "random_popout", "obstruct_content"} <= set(s["never"])
    for b in ("dock_right_pane", "results_in_right_pane", "badge_only_floats"):
        assert b in m["behaviors"]


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
