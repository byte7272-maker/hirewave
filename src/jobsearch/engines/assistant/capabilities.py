"""Assistant capability manifest — describe a feature once, inherit every behavior.

Prompts P179–P200 each hand-specified the assistant's behavior for one feature. But
they are all instances of the SAME small set of generic behaviors:

  * guide-on-arrival   — fires on EVERY navigation (never silent/collapsed): announce the
                         section, point at the focal point, and offer a relevant action.
                         Adaptive — skip the static greeting for a frequent/active user and
                         go straight to the announce + offer; don't repeat the same greeting
  * recognize          — a verb (connect/add/remove/change/show/walk/tailor/research/…)
                         + an object resolves to one action
  * pending-offer      — every yes/no question arms a concrete follow-up; "yes" runs it.
                         While a question is pending, SURFACE the hold-to-talk mic;
                         releasing it submits the spoken answer and auto-runs on an
                         affirmed/valid answer; once answered, clear the offer + release
                         the mic permission (no re-fire)
  * confirm-destructive— a human is asked ONLY for a CHOICE/OPTION the assistant offers, or
                         for MOVING/DELETING the user's files (P331). A reversible edit does
                         NOT prompt (see undo-over-confirm); navigating, reading, focusing,
                         searching and refreshing never prompt. During a spoken/typed command
                         no secondary permission prompt is raised, and prompts never stack —
                         see SURFACE.confirm_policy
  * undo-over-confirm  — for anything the app can undo/restore (every document edit saves a
                         version), APPLY it and offer a one-tap Undo instead of asking first.
                         Fewer prompts; the same safety, via easy undo. Apply this everywhere
                         a change is reversible
  * highlight + dock    — point at the element being discussed; keep it visible; HOLD the
                         position + highlight until the user acts or a timeout expires
                         (don't snap back and cover the target); interruptible at once.
                         Focus granularity: a request to SHOW a specific document or
                         explicit value → center THAT item; a request for a LIST → focus
                         the section, not one row
  * speak-on-update    — narrate whenever the overlay text changes (every screen); SPEAK
                         every walkthrough step's `say` as it highlights/advances (and on
                         Next) — never highlight a step silently; guide tasks end to end
  * autosize-to-content— the assistant's right-pane window sizes itself to fit its content
                         comfortably; nothing is hidden or needs scrolling and there are NO
                         pulsing up/down arrows (the right pane has room — grow the pane,
                         don't hide content)
  * narrate-values     — read a section's live `readouts` and, while narrating, speak each
                         value and highlight its element (aware of what's on screen)
  * error-aware        — detect a visible error/empty/failed-load state on the page and
                         surface it + offer a fix/retry, instead of narrating as if fine
  * one-source-of-truth— "the current X" always resolves the same way everywhere

This module is the **single declarative place** those engines read. To give the
assistant full behavior on a NEW feature, add a :data:`CAPABILITIES` entry — no new
per-feature logic. The frontend drives guide/highlight/offer/confirm from the manifest
(served by ``GET /assistant/capabilities``); the NLU shares its section/object aliases
so recognition and guidance never diverge. See ``docs/ASSISTANT_CAPABILITIES.md``.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from jobsearch.engines.assistant.intent import _PLAYBOOKS, _SECTIONS, command_catalog

#: Manifest schema version — bump when the shape changes so the client can adapt.
VERSION = 1

#: The generic behaviors every feature inherits (documentation the client can render,
#: and the contract these engines honor). Flags, not free text, so the UI can key off them.
BEHAVIORS = [
    "guide_on_arrival", "recognize_verb_object", "pending_offer", "confirm_destructive",
    # reversible changes apply + offer Undo instead of prompting; the pane auto-sizes to its
    # content (no hidden/scrolled content, no pulsing arrows) — P286.
    "undo_over_confirm", "autosize_to_content",
    "highlight_and_dock", "speak_on_update", "narrate_values",
    "error_aware", "one_source_of_truth",
    # the assistant speaks a scripted line for EVERY state of a multi-step flow (never a
    # silent spinner) and has a spoken answer ready for the questions a user predictably
    # asks mid-flow — see FLOWS / FLOW_FAQ (P252).
    "narrate_flow_steps", "answer_anticipated",
    # speech must be SMOOTH (P284): exactly one utterance plays at a time, each a complete
    # sentence/`say` string (never split mid-sentence into chunks), the next starts only
    # after the previous finishes (onend), and starting a new line cancels the old one
    # cleanly — no overlapping voices, no audible clicks, no half-finished sentences.
    "speak_serialized",
    # core spatial behaviors (P254): as the assistant talks about something it MOVES a
    # visible pointer to that element and keeps it spotlighted (point_to_focus); and it
    # is position-aware — its own dock/avatar/overlays/pointer never cover the focused
    # element or the content in view, repositioning to keep the focus visible (avoid_occlusion).
    "point_to_focus", "avoid_occlusion",
    # reasoning (P255): the assistant explains in plain terms what it found, why it's
    # suggesting an action, and how it benefits the user's goal, and it anticipates +
    # BULKS the permissions a plan needs so the user grants once (POST /assistant/reasoning).
    "reason_and_bulk_consent",
    # pacing (P257): the assistant moves briskly and exposes a speed control for how fast
    # it advances through steps/items (distinct from the TTS voice rate, P253); and it
    # never goes silent without closing the loop — it confirms a task is complete or asks
    # if it's still wanted, and when the user skips an item it asks whether to go to the next.
    "pace_control", "confirm_task_boundary",
    # badge-first (P258): on landing the assistant starts speaking while COMPACT (a badge),
    # a tap expands the full window, press-and-hold the badge arms the mic, and the badge
    # can surface a binary yes/no — distilling a larger question to its point — as a
    # tap alternative to holding the mic.
    "badge_first",
    # error handling (P267): every failure is acknowledged immediately and logged with its
    # cause/fix (POST /assistant/error, GET /assistant/errors, /troubleshooting); the assistant
    # NEVER goes silent on a bad mic read or nonsense — it re-asks; the live mic transcript is
    # shown and stays editable so wrong input can be corrected and re-submitted.
    "never_silent_errors", "editable_transcript",
    # web fallback (P268): when a request is COHERENT but unrecognized (not gibberish), the
    # assistant surfaces a yes/no offer to search the web for it instead of dead-ending; the
    # offer arms as `pending` so a "yes" resolves to web_search (interpret → `offer`).
    "offer_web_on_unrecognized",
    # document mastery (P275): on a document the assistant models the WHOLE thing, not a
    # flat bullet list. It centers the document, compartmentalizes it into its sections
    # (GET /resumes|cover-letters/{id}/map), can jump to and highlight any section or
    # keyword (focus_document → /documents/locate), works a single bullet in place (read,
    # reword, rephrase), and detects dated/stale figures and refreshes them from the web
    # with its reasoning shown (refresh_metric → /documents/refresh-metric).
    "compartmentalize_document", "navigate_and_highlight", "analyze_bullets",
    "refresh_stale_metrics",
    # summary health (P276): the assistant UNDERSTANDS the summary (not just reads it),
    # lists the weaknesses it found with a fix for each, and keeps it fresh — prompting a
    # refresh when the document changed materially (GET /resumes/{id}/summary-review →
    # understanding/weaknesses/suggestion/fresh/fingerprint; the summary_review flow walks
    # it in the right pane, badge pointing/narrating step by step).
    "understand_summary", "keep_summary_fresh",
    # whole-document review (P280): the assistant walks the ENTIRE document — résumé
    # (header, summary, each experience role with dates + bullets, education, skills) or
    # cover letter (greeting, opening, body, closing) — OFFERS to read the findings, and
    # moves section by section (GET /resumes|cover-letters/{id}/full-review → sections/
    # findings/script), never a summary-only result printed in place.
    "review_whole_document",
    # proactive scan (P281): once per session, on landing, the assistant scans on its own
    # for a severe UNRESOLVED error from before, reportable items (a stale summary, bullets
    # with dated figures) and a recent-activity recap, and raises them highest-priority
    # first with one spoken lead (GET /assistant/session-scan?session_id=… — a repeat in the
    # same session returns repeat:true, so it fires exactly once).
    "proactive_session_scan",
    # layout (P279): the assistant's HOME is the docked right pane — its expanded window
    # lives there (not a floating overlay), and every result/finding surfaces there, never
    # buried in a floating window, at the top of the page, or popped out at random. The only
    # free-floating element is the compact badge, which never obstructs content; when a
    # result arrives the floating main window collapses so it can't block anything. See SURFACE.
    "dock_right_pane", "results_in_right_pane", "badge_only_floats", "collapse_main_on_result",
    # narrate the choices (P319): when a change to a bullet/section offers replacement options
    # or alternatives, the assistant READS each option aloud in turn with the same read-along
    # word-highlighting + pointer, marks the option it's on, pauses between them, and lets the
    # user pick or edit each — it never drops a silent list of options the user has to read.
    "narrate_options",
    # action awareness (P328): the assistant is aware of DIRECT user actions too — when the
    # user clicks a page control themselves (Design, Refresh matches, New search, Export, …),
    # the client tells the assistant (POST /assistant/observe {action,label}); the assistant
    # acknowledges what the user did and offers the natural next step, so it's never a silent
    # bystander to things the user does without speaking. Known actions get a tailored line; any
    # other action gets a graceful generic acknowledgement (never nothing).
    "observe_user_actions",
    # growth advice (P330): the assistant advises what would make the résumé + SKILLSET
    # stronger — skills to build, certifications to earn, education/degrees/courses,
    # experience framing, positioning — in general or for a role/job/career goal
    # (strengthen_resume intent → POST /resumes/{id}/strengthen). Forward-looking growth,
    # distinct from review_document (fixing the writing of the existing résumé).
    "advise_growth",
    # uninterrupted voice flow (P331): when the user speaks (or types) a command, the
    # assistant runs it end-to-end WITHOUT raising secondary manual permission/confirmation
    # prompts. A human response is required ONLY when the assistant is offering a CHOICE or
    # OPTION, or when MOVING/DELETING the user's files. Everything else — navigate, read,
    # focus, search, refresh, and reversible document edits (apply + Undo) — just runs. See
    # SURFACE.confirm_policy.
    "uninterrupted_voice_flow",
    # never stack prompts (P331): at most one prompt is shown at a time; prompts never
    # overlap, and a running (spoken) command is never interrupted mid-flow by a routine
    # confirm. Exiting one prompt must not reveal a queue of more.
    "no_stacked_prompts",
    # one smart interpreter for ALL input (P340): every user input — voice or typed, from the
    # badge or the console, mid-flow or not — resolves through the SINGLE LLM-backed interpreter
    # (POST /assistant/interpret) with full context (pending offer, on-screen options, focused
    # item, active flow). The client does NOT hand-stage per-branch responses; it passes the
    # context and runs whatever the interpreter returns. This is the smart core minimum that
    # makes flows reliable without staging every reply. An invalid LLM key silently disables
    # it (see ASSISTANT_INTENT.md) — keep the premium provider healthy.
    "one_interpreter_for_all_input",
    # guided permission setup (P337): the permissions and steps to enable WEB RESEARCH (and
    # any consent checkboxes/toggles it needs) are part of the SETUP WIZARD, and the assistant
    # FULLY walks them — narrating each step, focusing/animating the exact control, and
    # automating what it safely can (open the page/panel, scroll+spotlight, flip in-app
    # toggles). The user performs the actual permission grant / consent tick themselves (the
    # assistant points at it, never self-grants). See FLOWS.enable_research.
    "guided_permission_setup",
]

#: WHERE the assistant lives and renders — a declarative layout contract so the client
#: never buries results in a floating window, puts them at the top of the page, or lets the
#: main window pop out and obstruct content (P279). The right pane is the single home.
SURFACE: dict[str, Any] = {
    "home": "right_pane",            # the assistant's dedicated/expanded window docks here
    "expanded_window": "right_pane",  # NOT a floating center overlay
    "results": "right_pane",         # every finding/proposal/answer renders here
    "floating": "badge_only",        # only the compact badge floats
    "collapse_main_on_result": True,  # a result collapses the floating window so it never blocks
    # The text input is PINNED to the TOP of the right pane: always visible, always above the
    # pane's functions, never summoned by a click or hidden below a scroll. The pane is kept
    # decluttered with NO duplicated functions, so the user can always type without hunting.
    "input": "pinned_top",
    "input_always_visible": True,
    "no_duplicate_functions": True,
    # The SAME right-pane surface (docked pane, pinned-top input, decluttered) applies on
    # EVERY page — Matches, Applications, Auto-apply, Inbox, Interviews, Documents, all of
    # them — not only Documents. Clicking the badge anywhere opens that full right pane, not
    # a cramped inline box next to the badge.
    "consistent_across_pages": True,
    "badge_opens": "right_pane",
    # A single tap/press on the badge WAKES the assistant: it OPENS the right-pane console
    # with the pinned-top TYPE BOX available AND the assistant asks what the user would like
    # to do (ready to BOTH type and talk). A tap must NOT drop into a mute, voice-only
    # "hold the pill to talk" waiting state with no way to type — that is a regression. The
    # typed path stays reachable after a tap; press-and-HOLD additionally arms the mic
    # (press-to-talk). (P331)
    "badge": {
        "tap_wakes": True,
        "tap_opens_pane": True,       # the full right-pane console opens on a tap
        "tap_shows_type_box": True,   # with the pinned-top input ready to type
        "tap_asks_what_to_do": True,  # and the assistant asks what you'd like to do
        "wake_prompt": "What would you like to do?",
        "hold_arms_mic": True,        # a separate gesture; it does not replace tap-to-open
        # A SINGLE tap opens the pane + type box even when the assistant is SPEAKING or a
        # yes/no OFFER is pending — the offer must not hijack the tap into a voice-only
        # waiting state; it renders INSIDE the opened pane with its own buttons/input. One
        # tap is enough (no double-tap), and it is never consumed as the answer to a pending
        # offer. (P336)
        "tap_opens_even_when_busy": True,
        "single_tap_opens": True,
        "never": ["tap_to_voice_only_waiting", "no_type_box_after_tap", "silent_open",
                  "tap_consumed_by_pending_offer", "needs_double_tap", "tap_waits_when_busy"],
    },
    # EVERY place the assistant presents something for the user to respond to — a question, a
    # finding, an option, or a pending action — carries an inline, editable input right there,
    # so the user can answer AND modify what's shown before anything is accepted. A finding or
    # a proposed/pending action is never read-only: the user can edit its text in place and
    # accept the edited version. Nothing the assistant proposes is applied without the user
    # having an editable field to change it first.
    "input_at_every_prompt": True,
    "findings_editable": True,
    "pending_actions_editable": True,
    "edit_before_accept": True,
    # A pending yes/no OFFER already states the action and asks permission ("nothing is read
    # until you say yes"), so affirming it ("yes") EXECUTES the offered action directly — it
    # does NOT pop a second per-action consent ("Yes, search") that makes the user answer
    # twice. One yes runs it (for a non-destructive action like a web search). "No" declines.
    "offer_yes_executes": True,
    # CONFIRMATION POLICY (P331). A spoken/typed command runs end-to-end WITHOUT raising
    # secondary manual permission or confirmation prompts. Human interaction is required
    # ONLY for: (a) a CHOICE or OPTION the assistant is offering (the user picks), or
    # (b) MOVING or DELETING the user's files. Everything else runs without a prompt —
    # navigate, read/read-along, focus/highlight, search, refresh, status, and REVERSIBLE
    # document edits (which apply and offer Undo; see undo_over_confirm). Prompts never stack
    # or overlap (at most one at a time), and a running spoken command is never interrupted
    # mid-flow by a routine confirm. This is the single source for when a human must respond.
    "confirm_policy": {
        # Human permission is REQUIRED for these — the no-secondary-prompts rule never
        # suppresses them. Besides a choice/option and file move/delete, this includes any
        # OUTBOUND action on an EXTERNAL (third-party) site: SUBMITTING a form/application, and
        # the INITIAL authorization/consent to have the assistant complete tasks on external
        # sites (auto-apply, acting on the user's behalf off-app). These keep their explicit
        # consent (the P116 automation-scope grant + a per-submit confirm) — they are NOT a
        # routine in-app action.
        "require_human_only_for": ["offering_a_choice_or_option", "file_move", "file_delete",
                                   "submit_on_external_site", "authorize_task_on_external_site"],
        "no_prompt_for": ["navigate", "read", "read_along", "focus", "highlight", "search",
                          "refresh", "status", "reversible_edit", "apply_with_undo",
                          "interrupt_with_new_command"],
        "reversible_edits": "apply_with_undo",
        "no_secondary_confirms_during_command": True,
        "no_stacked_prompts": True,
        "voice_flow": "uninterrupted",
        # A NEW command that arrives mid-task preempts the current one IMMEDIATELY and runs at
        # a conversational pace — no "pause this and do X instead?" confirm, and no spoken
        # "I'll save your place" narration. If returning is useful, leave a quiet, optional
        # resume affordance (a chip) — never a blocking prompt or a spoken explanation.
        "interrupt_supersedes_immediately": True,
        "resume_affordance": "silent_optional",
    },
    # Voice input shows a LIVE audio-stream meter while listening, driven by the real mic
    # analyser (the app already builds a MediaStreamSource -> AnalyserNode on each hold) —
    # a requestAnimationFrame loop reads the analyser and animates the level, so the user
    # SEES the mic is hearing them. The meter is never a static/placeholder row of bars, and
    # the mic status reflects the LIVE track (listening while a track is live) — it never
    # reports "mic off" while a live getUserMedia track and granted permission exist.
    "mic": {
        "audio_meter": True,
        "meter_from_analyser": True,
        "meter_live_while_listening": True,
        "status_reflects_live_track": True,
        # The meter is driven ONLY by a LIVE getUserMedia stream's analyser — never a
        # decorative/placeholder animation. If the badge shows a moving meter it MUST have
        # actually acquired a mic stream and started recognition on it; a meter with no live
        # track behind it is a bug (P342). On HOLD, acquire the stream, wire
        # MediaStreamSource -> AnalyserNode -> meter, AND start SpeechRecognition on that same
        # stream; the badge and console share one acquisition so only one holds the mic at a time.
        "meter_requires_live_stream": True,
        "hold_acquires_stream_and_recognizer": True,
        # Press-to-talk ONLY: recognition runs while the mic is HELD and stops on release —
        # it never keeps listening between holds and scooping up background sound/music. A
        # transcript is submitted as a command ONLY if it was captured during a deliberate
        # hold; results that arrive when nothing is held (ambient) are discarded, as are
        # empty/very-low-confidence results — they are NOT turned into a command or a
        # "couldn't make sense of it … search the web?" offer.
        "press_to_talk_only": True,
        "stop_on_release": True,
        "discard_unheld_results": True,
        "discard_low_confidence": True,
        # The BADGE press-and-hold mic and the right-pane hold-to-talk are the SAME mic path:
        # both run recognition, animate the live meter, and submit the transcript through the
        # one interpreter (with context: pending offer, on-screen options, active flow). A
        # held badge answer of "yes"/"no"/anything resolves exactly like the console's — the
        # badge mic is never a dead listener that hears but can't act (P340).
        "badge_and_console_same_path": True,
        "badge_hold_submits": True,
        "never": ["static_meter", "unconsumed_analyser", "off_while_track_live",
                  "gate_on_self_test", "continuous_ambient_capture",
                  "submit_unheld_transcript", "command_from_noise",
                  "badge_mic_hears_but_cant_act", "badge_mic_different_path",
                  # P342: a meter that animates without a live getUserMedia stream behind it.
                  "meter_without_stream", "placeholder_meter_animation",
                  "badge_meter_but_no_recognizer"],
    },
    "never": ["top_of_page", "random_popout", "obstruct_content", "bury_in_floating_window",
              "hidden_input", "input_below_fold", "click_to_summon_input", "duplicate_functions",
              "confined_inline_box", "box_next_to_badge", "different_surface_per_page",
              "readonly_finding", "uneditable_pending_action", "prompt_without_input",
              "apply_without_edit_option", "double_confirm_offer", "second_consent_after_yes",
              # P331: no routine gating during a command, no stacked/overlapping prompts, and
              # a new command preempts the current task immediately (no "pause and do X
              # instead?" confirm, no spoken "I'll save your place").
              "stacked_prompts", "overlapping_prompts", "secondary_confirm_during_command",
              "confirm_reversible_edit", "permission_prompt_for_read_or_nav",
              "confirm_before_switching_task", "announce_saving_place", "pause_prompt_on_interrupt"],
}

#: Canonical action verbs and their spoken synonyms. A feature's actions reference a
#: verb by its canonical key; the client/NLU expand synonyms from here (one vocabulary,
#: not a regex per feature).
VERBS: dict[str, list[str]] = {
    "show": ["show", "open", "pull up", "take me to", "bring me to", "go to", "view"],
    "connect": ["connect", "add", "link", "set up", "hook up", "sign in", "enroll"],
    "remove": ["remove", "disconnect", "delete", "unlink", "revoke", "get rid of"],
    "change": ["change", "replace", "update", "switch", "edit", "modify", "fix"],
    "walk": ["walk me through", "review", "go through", "from the top", "one by one"],
    "tailor": ["tailor", "aim", "customize", "target"],
    "research": ["research", "look up", "tell me about", "what do you know about"],
    "search": ["find", "search", "filter", "look for", "list"],
    "save": ["save", "bookmark", "keep", "add to saved"],
    "apply": ["apply", "submit application", "fill this application"],
}

#: Verbs whose actions must confirm before running — only REMOVAL/DELETION (delete,
#: disconnect, unlink, revoke). A `change`/edit is NOT here: edits are reversible and apply
#: with Undo (undo_over_confirm), so they must not pop a routine confirm (P331). An action
#: that is genuinely irreversible can still set `destructive=True` / a `confirm` string
#: explicitly. See SURFACE.confirm_policy for the full rule (choices + file move/delete only).
DESTRUCTIVE_VERBS = {"remove"}

#: Action awareness (P328). When the user clicks a page control THEMSELVES — not via the
#: assistant — the client reports it (POST /assistant/observe {action,label}) and the
#: assistant acknowledges it + offers the natural next step, so it's never a silent bystander
#: to what the user does. Each entry: {say, next?} — `say` is the spoken acknowledgement,
#: `next` (optional) a one-line offer of the natural follow-up. Keys are canonical action
#: ids the client emits; ``ACTION_ALIASES`` maps looser names onto them.
ACTION_ACKS: dict[str, dict[str, str]] = {
    "refresh_matches": {"say": "You're refreshing your matches — I'll call out the strongest new fits as they land.",
                        "next": "Want me to walk you through the top three?"},
    "new_search": {"say": "New search — tell me the roles, titles, or location you want and I'll run it."},
    "reset_page": {"say": "You reset this page."},
    "reimport": {"say": "You're re-importing your jobs — I'll flag anything new that lands."},
    "get_descriptions": {"say": "You're pulling the full descriptions from each posting's own page."},
    "export_shortlist": {"say": "You're exporting your shortlist."},
    "open_design": {"say": "You opened the design options.",
                   "next": "Tell me a style, font, or color and I'll apply it."},
    "open_documents": {"say": "You're in your documents."},
    "tailor": {"say": "You started tailoring your résumé.",
              "next": "Point me at the job and I'll aim it there."},
    "save_job": {"say": "Saved that one.", "next": "Want me to tailor your résumé to it?"},
    "apply_job": {"say": "You opened the application for this job.",
                 "next": "Want me to help fill it in?"},
    "upload_document": {"say": "You're uploading a document — I'll map it once it's in."},
    "open_resume": {"say": "You opened your résumé."},
    "open_cover_letter": {"say": "You opened your cover letter."},
    "download": {"say": "You're downloading a copy of your document."},
    "refresh_metric": {"say": "You started a figures refresh.",
                      "next": "I'll check the web and show you what's current before anything changes."},
}

#: Looser action names the client might send, mapped onto a canonical ACTION_ACKS key.
ACTION_ALIASES: dict[str, str] = {
    "refresh": "refresh_matches", "refresh matches": "refresh_matches",
    "design": "open_design", "styles": "open_design", "change design": "open_design",
    "search": "new_search", "new search": "new_search",
    "reset": "reset_page", "export": "export_shortlist",
    "descriptions": "get_descriptions", "full descriptions": "get_descriptions",
    "save": "save_job", "apply": "apply_job", "upload": "upload_document",
    "resume": "open_resume", "résumé": "open_resume", "cover letter": "open_cover_letter",
    "documents": "open_documents",
}


def observe_action(action: str, label: str = "") -> dict[str, Any]:
    """Acknowledge a DIRECT user action (a page control they clicked themselves) so the
    assistant stays aware of what the user does, not just what it does itself (P328).

    Returns ``{action, reply, offer?}``. A known action gets a tailored acknowledgement and,
    where useful, a next-step offer; any unknown action gets a graceful generic line built
    from ``label`` so the assistant is NEVER silent about something the user just did."""
    key = re.sub(r"[\s\-]+", "_", str(action or "").strip().lower())
    if key not in ACTION_ACKS:
        key = ACTION_ALIASES.get(str(action or "").strip().lower(), key)
    spec = ACTION_ACKS.get(key)
    if spec:
        out: dict[str, Any] = {"action": key, "reply": spec["say"]}
        if spec.get("next"):
            out["offer"] = {"prompt": spec["next"], "yes": "Yes", "no": "No thanks"}
        return out
    # Graceful fallback: name what they did from the control's own label, never go silent.
    nice = (label or action or "that").strip()
    return {"action": key or "unknown",
            "reply": f"You opened {nice}." if nice else "Got it.",
            "offer": {"prompt": "Want a hand with it?", "yes": "Yes", "no": "No thanks"}}

#: Scripted interim narration for multi-step assistant flows, so the spoken lines are
#: defined centrally (not authored per client) and the assistant never goes silent
#: between the start and the final result (P252). ``speak`` maps a flow STATE to a
#: spoken line; ``{placeholders}`` are filled from the live flow (topic, summary, draft,
#: …). ``ask`` names the state that poses a yes/no question (surface it the P237 way:
#: spoken + mic-ready + Yes/No chips in the same render). ``focus`` is the single item
#: to spotlight while the flow runs (declutter — one thing at a time).
FLOWS: dict[str, dict[str, Any]] = {
    # The web-assisted bullet Update/Search flow (P250 §2 "Update"/"Search").
    "bullet_update_search": {
        "label": "Update a bullet from the web",
        "focus": "the bullet being changed",
        "ask": "proposing",
        "speak": {
            "start": "Let me check the web for current figures on {topic}.",
            "searching": "Searching the web now…",
            "found": "I found a few sources. Here's what they say: {summary}",
            "proposing": "Based on that, I'd change the bullet to: '{draft}.' Want me to apply it?",
            "applying": "Done — I updated the bullet and saved a version.",
            "not_found": "I couldn't find anything solid on that — want me to try a different "
                         "search, or leave the bullet as is?",
            "error": "That search didn't go through. Want me to try again?",
        },
    },
    # Re-word / Replace / Move / Remove on a selected bullet (P250 §2).
    "bullet_action": {
        "label": "Act on a selected bullet",
        "focus": "the selected bullet",
        "ask": "proposing",
        "speak": {
            "working": "One moment — working on that bullet.",
            "proposing": "Here's the change: '{draft}.' Want me to apply it?",
            "applying": "Done — saved a new version.",
            "removing": "Removing this bullet — you can undo if you change your mind.",
            "error": "That didn't go through. Want me to try again?",
        },
    },
    # Tailor the résumé to a specific job — a real, job-specific walkthrough that
    # ends with a tailored version, not generic advice (P269). Placeholders are filled
    # from POST /resumes/{id}/tailor (job title, fit score + verdict, missing keywords,
    # the concrete suggested changes), so every line is about THIS job, not a template.
    "tailor": {
        "label": "Tailor your résumé to a job",
        "focus": "your résumé beside the job's requirements",
        "ask": "proposing",
        "speak": {
            "start": "Let's aim your résumé at {job}. First I'll compare it to the posting and find the gaps.",
            "checking": "Comparing your résumé to what {job} actually asks for…",
            "fit": "Right now you're {verdict} for this — about {score} out of 100. It leans on {missing}, "
                   "which your résumé doesn't surface yet.",
            "needs_jd": "This posting only has a short blurb, so I can't pin down the real gaps yet. "
                        "Want me to pull the full job description from the site first?",
            "proposing": "I can make {count} targeted changes to close those gaps — for example: {example}. "
                         "Want me to apply them?",
            "applying": "Applied — I saved a version tailored to {job}. Want to use it to apply?",
            "no_gaps": "Good news — your résumé already covers what {job} wants. Want to use it to apply as is?",
            "not_found": "I couldn't load that job to compare against — want to pick the job again?",
            "error": "That didn't go through — want me to try again?",
        },
    },
    # Refresh a bullet's DATED figures from the web, reading the findings + reasoning aloud
    # so the user understands the change before accepting (P275). Placeholders are filled
    # from /documents/refresh-metric (entity/subject/period from the analysis; draft/
    # reasoning/changes from the proposal). The user reviews/edits/accepts/rejects.
    "metric_refresh": {
        "label": "Refresh a dated figure from the web",
        "focus": "the bullet with the outdated numbers",
        "ask": "proposing",
        "speak": {
            "flagged": "Heads up — this bullet's figures are tied to {period}, which is now out "
                       "of date. Want me to find the current numbers?",
            "planning": "I'll look up {entity} {subject} for the latest period.",
            "searching": "Searching the web for the current figures now…",
            "reading": "Reading what the sources say and lining it up against your bullet…",
            "found": "Here's what I found: {reasoning}",
            "proposing": "I'd update it to: '{draft}.' Check the figure and its period — want me to apply it?",
            "applying": "Done — I swapped in the current figure and saved a version.",
            "not_found": "I couldn't find a clear, newer figure for that — want to point me at a "
                         "specific page, or leave the bullet as it is?",
            "error": "That search didn't go through. Want me to try again?",
        },
    },
    # Understand + critique + refresh the SUMMARY, walked step by step in the right pane
    # (badge pointing/narrating/navigating) — the assistant reads what it says, lists the
    # weaknesses it found with a fix for each, and proposes a rewrite (P276). Placeholders
    # come from GET /resumes/{id}/summary-review.
    "summary_review": {
        "label": "Review and refresh your summary",
        "focus": "the summary, with the findings in the right pane",
        "ask": "proposing",
        "speak": {
            "start": "Let me actually read your summary and see how well it's holding up.",
            "understanding": "Here's what it says right now: {reads_as}",
            "stale": "It's drifted from the rest of your résumé — {stale_reasons}. Worth a refresh.",
            "weaknesses": "I found {count} things to tighten. I'll take them one at a time.",
            "weakness": "{title}. {detail} — here's the fix: {fix}",
            "proposing": "Here's a rewrite that addresses those, using only what's already in your "
                         "résumé: '{suggestion}.' Want me to use it?",
            "applying": "Done — I refreshed your summary and saved a version.",
            "fresh": "Your summary is in good shape and still matches your résumé — nothing to change "
                     "right now. I'll flag it if a big change makes it drift.",
            "error": "That didn't go through. Want me to try again?",
        },
    },
    # Walk the WHOLE document section by section, offering to read what was found (P280).
    # Placeholders come from GET /resumes|cover-letters/{id}/full-review; the client plays
    # the ordered `script` (offer → each section announce + findings → close), pointing at
    # each section's anchor / each finding's locate.
    "document_review": {
        "label": "Review your whole document",
        "focus": "each section in turn, with findings in the right pane",
        "ask": "offer",
        "speak": {
            "offer": "I read through your whole {doc} — want me to walk you through what I found, "
                     "section by section?",
            "section": "{announce}",
            "finding": "{title}. {detail} Here's the fix: {fix}",
            "close": "That's the full pass. Want me to start fixing these, top to bottom?",
            "clean": "That's the full pass — it's in good shape. Nothing needs changing right now.",
            "error": "That didn't go through — want me to try again?",
        },
    },
    # My Work Highlights: turn a pasted data dump into résumé-ready evidence (P251 §3).
    "highlights_extract": {
        "label": "Extract evidence from a data dump",
        "focus": "the pasted notes",
        "ask": "proposing",
        "speak": {
            "working": "Reading your notes and pulling out the accomplishments…",
            "found": "I pulled out {count} points worth highlighting.",
            "proposing": "Here are bullets I can add: review them and I'll save the ones you keep.",
            "applying": "Added — saved a version.",
            "not_found": "I couldn't find clear accomplishments in that — want to add more detail?",
            "error": "That didn't go through. Want me to try again?",
        },
    },
    # SETUP WIZARD step: enable web research + grant the permissions/checkboxes it needs
    # (P337). The assistant fully WALKS this — it narrates each step, FOCUSES/animates the
    # exact control, and AUTOMATES what it safely can (open the right page/panel, scroll to
    # and spotlight the toggle/checkbox, flip in-app toggles it's allowed to). The user still
    # performs the actual PERMISSION GRANT / consent checkbox themselves (granting permission
    # is a human action — the assistant points at it and narrates, it never self-checks a
    # consent box or auto-grants a scope). ``automate`` names what the assistant does for the
    # user; ``user_action`` names the one thing the user clicks at each step.
    "enable_research": {
        "label": "Turn on web research",
        "focus": "the web-research setting (and the extension/permission it needs)",
        "ask": "confirming",
        "part_of_setup": True,
        "automate": ["open_the_setting", "scroll_into_view", "spotlight_the_control",
                     "flip_allowed_in_app_toggles", "advance_on_done"],
        "user_action": "grant the permission / tick the consent checkbox",
        "speak": {
            "start": "Let's turn on web research so I can pull current figures, research companies, "
                     "and grab full job descriptions. I'll walk you through it — it's quick.",
            "why": "Web research lets me check live sources for you; without it I can only use what's "
                   "already in the app.",
            "install": "First, Project Harbor Connect. I'll open the install page — add it, then come "
                       "back and I'll take it from there.",
            "permission": "Now the one thing only you can do: tick the permission box I'm pointing at "
                          "to let it read pages for research. I'll highlight exactly where.",
            "enable": "Great — I'll switch web research on here.",
            "confirming": "That's the box to check to turn on web research — I've spotlighted it. "
                          "Check it and we're set.",
            "testing": "Let me run a quick test search to confirm it's working…",
            "done": "Web research is on. I'll use it whenever I need current information.",
            "blocked": "It looks like the permission didn't go through. Want me to point you at the "
                       "exact setting again?",
            "error": "That step didn't complete — want me to walk it again from here?",
        },
    },
    # Get a job's REAL description straight from its source page — the reliable path for
    # bot-walled boards (LinkedIn/Indeed). The assistant opens the posting; the USER
    # clears any login/captcha (we never bypass it); then the assistant reads the opened
    # page and posts it back to POST /jobs/{id}/jd, which parses pay/benefits/location/
    # requirements and supersedes any placeholder or estimated body.
    "enrich_from_source": {
        "label": "Get the real description from the posting",
        "focus": "the job's own posting page",
        "ask": "start",
        "user_action": "open the posting and clear any sign-in or captcha the site shows",
        "automate": ["open_source_url_in_browser", "capture_rendered_page",
                     "post_page_to_jd_endpoint", "refresh_the_match"],
        "speak": {
            "start": "This posting came in as just a title, so I can't see the real requirements yet. "
                     "Want me to open it on {source} so I can read the full description?",
            "opening": "Opening {job} on {source}…",
            "user_clears": "If it asks you to sign in or prove you're human, go ahead and do that — I'll "
                           "wait, then read the page. I never sign in or get past those for you.",
            "capturing": "Got the page — pulling the description, pay, and requirements now…",
            "done": "Done — I read the real posting. {job} now shows {added}. Want me to rate your fit "
                    "against it?",
            "nothing": "I opened it but couldn't find a description on that page — it may need you to "
                       "click into the full posting first. Want to try that and I'll re-read it?",
            "blocked": "The page didn't load for me to read. If you can open it in your browser, I can "
                       "capture it from there instead.",
            "error": "That didn't go through — want me to try opening it again?",
        },
    },
}

#: Spoken answers to the questions a user predictably asks DURING a flow, so the
#: assistant answers comprehensively instead of falling silent (P252 §3/§4).
#: ``{placeholders}`` are filled from the live flow (sources, old/new text, reason).
FLOW_FAQ: dict[str, str] = {
    "where_from": "From {sources} — I can show the links.",
    "accuracy": "It's summarized from public web pages, so double-check names and figures "
                "before you rely on them.",
    "what_changed": "It was '{old}'; the new version is '{new}.'",
    "can_edit": "Yes — edit the draft right here and I'll save exactly what you approve.",
    "undo": "Reverted to the previous version.",
    "status": "Still working — just a few seconds.",
    "why": "{reason}",
    # Documents / metric-refresh (P275).
    "which_section": "You're looking at {section}. I can take you to any section — Summary, "
                     "Experience, Education, or Skills — just name it.",
    "source_for_metric": "I based it on {sources} — the figure and its period are on that page; "
                         "I can show you the line.",
    "why_flagged": "The figures are tied to {period}, so as of this year they're out of date — "
                   "that's why I flagged them to refresh.",
}


def _aliases(section: str) -> list[str]:
    """Spoken synonyms for a section — shared with the NLU so nav/recognition agree."""
    return list(_SECTIONS.get(section, ()))


def _offer(prompt: str, intent: str, slots: Optional[dict] = None) -> dict[str, Any]:
    """A scripted yes/no question the assistant asks, bound to the concrete action it
    runs on 'yes' — so the assistant is never left asking something it can't action."""
    return {"prompt": prompt, "on_yes": {"intent": intent, "slots": dict(slots or {})}}


def _action(label: str, verb: str, objects: list[str], intent: str,
            slots: Optional[dict] = None, *, destructive: Optional[bool] = None,
            confirm: str = "") -> dict[str, Any]:
    """One action a feature exposes. ``destructive`` defaults from the verb class, so a
    'remove'/delete action auto-confirms unless explicitly overridden; an edit ('change')
    does not (it applies with Undo). Set ``destructive=True`` for a genuinely irreversible one."""
    dest = DESTRUCTIVE_VERBS.intersection({verb}) != set() if destructive is None else destructive
    return {
        "label": label, "verb": verb, "objects": objects,
        "intent": intent, "slots": dict(slots or {}),
        "destructive": bool(dest), "confirm": confirm,
    }


#: THE manifest. One entry per section/feature. Each entry fully describes how the
#: assistant should behave there, so the generic engines need nothing feature-specific.
#:   purpose   — one line spoken on arrival (guide_on_arrival)
#:   current   — what "this/current X" resolves to here (one_source_of_truth)
#:   walkthrough — a playbook key to offer on arrival, or None
#:   actions   — verb+object -> intent/slots, with destructive/confirm
#:   controls  — primary on-screen controls + what each does (to highlight + explain)
#:   offers    — default next-step prompts to arm as pending offers (P198)
CAPABILITIES: dict[str, dict[str, Any]] = {
    "dashboard": {
        "purpose": "Your home base — a quick read on matches, documents, and what to do next.",
        "current": None,
        "walkthrough": None,
        "actions": [
            _action("See my matches", "show", ["matches"], "navigate", {"section": "matches"}),
            _action("Open my documents", "show", ["documents"], "navigate", {"section": "documents"}),
            _action("Status report", "walk", ["status"], "status_report"),
        ],
        "controls": [
            {"label": "Matches brief", "does": "How many matches and strong fits you have, best first."},
            {"label": "Continue where you left off", "does": "Jump back into your last task."},
        ],
        "offers": [
            _offer("Want a quick status report?", "status_report"),
            _offer("Want me to walk your top matches?", "start_playbook", {"playbook": "walk_matches"}),
        ],
        "steps": [
            {"say": "This is your dashboard — a quick read on your matches, documents, and what to do next.",
             "highlight": "Matches brief"},
            {"say": "Your Matches brief shows how many fits you have, best first — open it to dive in.",
             "highlight": "Matches brief"},
            {"say": "You can always pick up where you left off from here.",
             "highlight": "Continue where you left off"},
        ],
        # Live values this page shows. The runtime reads each from the section's primary
        # API response (here GET /dashboard) and, while narrating, SPEAKS the value and
        # HIGHLIGHTS its tile — the assistant is aware of what's on screen (narrate_values).
        "readouts": [
            {"key": "matches", "label": "Matches", "source": "matches.total", "highlight": "Matches"},
            {"key": "strong", "label": "Strong fits", "source": "matches.strong", "highlight": "Matches"},
            {"key": "interviews", "label": "Interviews", "source": "interviews", "highlight": "Interviews"},
            {"key": "applications", "label": "Applications", "source": "applications.total", "highlight": "Applications"},
            {"key": "resumes", "label": "Résumés", "source": "resumes", "highlight": "Documents"},
            {"key": "saved_jobs", "label": "Saved jobs", "source": "saved_jobs", "highlight": "Saved jobs"},
            {"key": "weekly_goal", "label": "Weekly goal", "source": "weekly_goal.done", "highlight": "Weekly goal"},
        ],
    },
    "matches": {
        "purpose": "Jobs ranked best-first for you — open one to see why it fits and the gaps.",
        "current": "the focused match, or the top-ranked match if none is focused",
        "walkthrough": "walk_matches",
        "actions": [
            _action("Review my matches", "walk", ["matches"], "start_playbook", {"playbook": "walk_matches"}),
            _action("Tailor my résumé to this job", "tailor", ["resume", "job"], "start_playbook", {"playbook": "tailor"}),
            _action("Research this company", "research", ["company"], "research_company", {"company": ""}),
            _action("Apply to this job", "apply", ["job"], "start_playbook", {"playbook": "apply_job"}),
            _action("Save this one", "save", ["job"], "save"),
            _action("Find jobs like…", "search", ["jobs"], "search_jobs"),
        ],
        "controls": [
            {"label": "Top match card", "does": "Open the #1 match to see the why and the gaps."},
            {"label": "Refresh matches", "does": "Pull the latest roles and re-rank."},
        ],
        "offers": [
            _offer("Want me to walk your top matches?", "start_playbook", {"playbook": "walk_matches"}),
            _offer("Research the top company?", "research_company", {"company": ""}),
        ],
        "steps": [
            {"say": "These are your job matches, ranked best-first for you.",
             "highlight": "Top match card"},
            {"say": "Open the top card to see why it fits and what's missing.",
             "highlight": "Top match card"},
            {"say": "Pull the latest roles any time with Refresh matches.",
             "highlight": "Refresh matches"},
        ],
        "readouts": [
            {"key": "matches", "label": "Matches", "source": "matches.total", "highlight": "Top match card"},
            {"key": "strong", "label": "Strong fits", "source": "matches.strong", "highlight": "Top match card"},
        ],
    },
    "documents": {
        "purpose": "Your résumé or cover letter, shown whole — I center it, lay out its sections, "
                   "and can jump to, read, or sharpen any part.",
        "current": "the open document, centered — résumé unless a cover letter is shown",
        "walkthrough": None,
        # On arrival the assistant does NOT ask "what would you like to do here?" — it
        # opens the document at the TOP and gives a one-line map of its sections (from
        # GET /resumes|cover-letters/{id}/map), then offers the first useful move; as it
        # works a section it scrolls to and highlights it (focus follows the work).
        "arrival": {
            # The document renders in ONE place: the editor. There is no separate
            # Documents-section preview with its own controls — "show my résumé" opens
            # the editor, and the assistant's full function set lives there. The marquee
            # (and any version info elsewhere) just points into the editor.
            "surface": "editor",
            "single_render": True,
            "start": "top",            # open scrolled to the TOP of the document, not centered
            "focus_follows_work": True,  # then scroll to + highlight the section being worked on
            "keep_focus_in_view": True,  # if the worked paragraph runs past the card, scroll to reveal the rest
            "map": True,               # read the section outline so the assistant knows the whole doc
            # The map is for the assistant's OWN navigation/focus — it is NOT rendered as a
            # user-facing "Sections of your résumé" list. That list is clutter: drop it.
            "show_section_list": False,
            # Follow-along is mandatory, not optional: whenever the assistant narrates or works
            # a line/section it must (a) scroll it into view, (b) highlight that exact line, and
            # (c) show a visible pointer/active marker on it, and when reading aloud, highlight
            # the words as they are spoken — so the user can always see what is being worked on.
            "read_along": True,
            "point_at_active_line": True,
            "highlight_spoken_words": True,
            # Word-highlight sync is driven by the narration AUDIO element's real playback
            # position (its currentTime / duration), NOT a free-running timer — a timer races
            # ahead of server-TTS audio (which has load/latency and uneven cadence). Words are
            # scheduled across the measured audio duration weighted by length + punctuation
            # pauses, so the highlight tracks the voice and can never run ahead of it.
            "word_sync": "audio_currenttime",
            "word_sync_no_timer": True,
            "word_weight": "length_plus_pause",
            # How a line is narrated (read-along), hardened against the "went silent on a
            # number" failure: a single line is ONE /narration/speak call (never split into
            # per-sentence clips that must chain — a chain can leave the next clip silent),
            # the word schedule is built from the EXACT text sent to the voice (so a number
            # like "23.5%" stays aligned instead of the audio saying "23 point 5 percent"
            # while the highlight expects one token), splitting (only for text near the
            # 8000-char cap) never falls inside a number/decimal, and a TTS hiccup retries
            # once then continues — the read never goes silent mid-line.
            "narration": {
                "whole_line_one_call": True,
                "schedule_from_spoken_text": True,
                "no_split_inside_number": True,
                "never_silent": True,
                "guard_nan_duration": True,
                # Multi-clip reads (a line, then each option; or a walk across sections) play
                # as a QUEUE that must not drop a clip. The first read after a page reload
                # cold-FETCHES each clip; the queue prefetches the next while the current plays
                # and advances on `ended`, and a slow/cold fetch makes it WAIT, never end the
                # queue — so it doesn't go silent after the first clip/section.
                "queue": {
                    "prefetch_next": True,
                    "advance_on_ended": True,
                    "wait_for_cold_fetch": True,
                    "never_drop_queue": True,
                },
                # A neural voice reads an ALL-CAPS acronym as a word ("IT" -> "it"). Speak it by
                # its letters instead — use the map's per-line `speak_text` (acronyms dotted:
                # "I.T."), which keeps the token count so the word highlight stays aligned.
                "acronyms_as_letters": True,
                "use_speak_text": True,
                # When a change offers REPLACEMENT OPTIONS/alternatives, read each option
                # aloud in turn with the same read-along word-highlighting + pointer: announce
                # the count, number each ("Option 1:"), mark/point at the option being read,
                # pause between them, and let the user pick or edit (P314) any one. Never drop
                # a silent list of options for the user to read on their own.
                "options": {
                    "narrate_each": True,
                    "highlight_each": True,
                    "point_at_current": True,
                    "announce_count": True,
                    "number_options": True,
                    "pause_between": True,
                    "pick_or_edit_each": True,
                },
                # The read-along lead-in matches the line TYPE — the Summary is not "a
                # bullet". Pick the intro from the selected line's section/kind; the intro
                # itself is NOT highlighted (only the line's own words are).
                "intro_by_line_type": {
                    "summary": "Your summary reads:",
                    "headline": "Your headline reads:",
                    "header": "Your headline reads:",
                    "experience": "This bullet reads:",
                    "skills": "This line reads:",
                    "education": "This line reads:",
                    "projects": "This bullet reads:",
                    "bullet": "This bullet reads:",
                    "paragraph": "This paragraph reads:",
                    "cover_letter": "This paragraph reads:",
                    "default": "This line reads:",
                },
            },
            "announce": "whole_document",
        },
        # The chips shown for the CURRENTLY SELECTED line — the genuinely useful moves, in
        # priority order. Weak/clutter chips ("fold in a work highlight", bare "clear this
        # line") are not the headline options. "Refresh the figures" shows only when the line
        # has dated metrics; "Tailor to the job" only when a target job is set. Every one of
        # these presents its result in an EDITABLE field before it is applied (see SURFACE).
        "line_actions": [
            _action("Make it stronger", "change", ["bullet", "line"], "start_playbook",
                    {"playbook": "bullets", "mode": "stronger"}, destructive=False),
            _action("Add a number", "change", ["bullet", "line"], "start_playbook",
                    {"playbook": "bullets", "mode": "quantify"}, destructive=False),
            _action("Make it concise", "change", ["bullet", "line"], "start_playbook",
                    {"playbook": "bullets", "mode": "tighten"}, destructive=False),
            _action("Refresh the figures", "research", ["bullet", "metrics"], "refresh_metric",
                    {"when": "has_dated_metric"}),
            _action("Tailor it to the job", "tailor", ["bullet", "line"], "start_playbook",
                    {"playbook": "tailor", "when": "job_targeted"}),
            _action("Edit it myself", "change", ["bullet", "line"], "edit_inline",
                    {"editable": True}, destructive=False),
            _action("Read it with me", "walk", ["bullet", "line"], "read_bullets",
                    {"read_along": True}),
        ],
        # Where the live structure + analysis come from (the client fetches these).
        "data": {
            "map_resume": "/api/v1/resumes/{id}/map",
            "map_cover_letter": "/api/v1/cover-letters/{id}/map",
            "locate": "/api/v1/documents/locate",
            "refresh_metric": "/api/v1/documents/refresh-metric",
            "summary_review": "/api/v1/resumes/{id}/summary-review",
            "full_review_resume": "/api/v1/resumes/{id}/full-review",
            "full_review_cover_letter": "/api/v1/cover-letters/{id}/full-review",
        },
        "actions": [
            _action("Show my résumé", "show", ["resume"], "navigate",
                    {"section": "documents", "doc": "resume", "view": "editor"}),
            _action("Show my cover letter", "show", ["cover_letter"], "navigate",
                    {"section": "documents", "doc": "cover_letter", "view": "editor"}),
            _action("Go to a section", "show", ["section"], "focus_document",
                    {"section": "documents", "mode": "section", "highlight": True}),
            _action("Find or highlight text", "search", ["text"], "focus_document",
                    {"section": "documents", "mode": "text", "highlight": True}),
            _action("Review my whole résumé", "walk", ["document", "resume"], "review_document", {}),
            _action("Review my summary", "walk", ["summary"], "review_summary", {}),
            _action("Read a bullet to me", "walk", ["bullet"], "read_bullets", {}),
            # A bullet edit saves a version, so it APPLIES and offers Undo — no confirm prompt.
            _action("Sharpen a bullet", "change", ["bullet"], "start_playbook", {"playbook": "bullets"},
                    destructive=False),
            _action("Refresh its figures from the web", "research", ["bullet", "metrics"], "refresh_metric", {}),
            _action("Tailor it to a job", "tailor", ["document"], "start_playbook", {"playbook": "tailor"}),
            _action("Change the design", "change", ["design"], "start_playbook", {"playbook": "design"},
                    destructive=False),
            # Work Highlights is its OWN page — reachable when needed, not part of the default pane.
            _action("Open Work Highlights", "show", ["highlights"], "navigate",
                    {"section": "documents", "view": "work_highlights"}),
            _action("Update it on my job sites", "change", ["document", "boards"], "sync_documents", {},
                    destructive=False),
        ],
        "controls": [
            {"label": "Document", "does": "The whole document, centered and editable. On open I center it and "
             "map its sections; say 'go to Experience' (or any section) and I scroll to and highlight it, and "
             "'highlight …' / 'where does it say …' spotlights a word or paragraph — for a cover letter too."},
            {"label": "Section map", "does": "The document's outline — Summary, Experience, Education, Skills "
             "(cover letters: the body paragraphs). Pick a section to jump to it; a marker shows which parts have "
             "something worth a look, like dated figures."},
            {"label": "Summary health", "does": "I actually read your summary — tell you what it claims, "
             "then list the weaknesses I found (no role, vague, no number, missing your top skills, drifted "
             "from your experience) each with a fix, and propose a rewrite from your own résumé. I keep it "
             "fresh too: when a big change makes it out of date I flag it to refresh. Walked step by step in "
             "the right pane — I point at each finding as I narrate it."},
            {"label": "Bullet workbench", "does": "Pinpoint a single bullet and I read it, then offer real "
             "improvements on THAT line — reword it stronger, rephrase for clarity, fold in a work highlight, or "
             "refresh an out-of-date number. Not a copy of the bullet list — it's where we actually change one. "
             "I show the result as an editable draft and only commit when you approve."},
            {"label": "Refresh figures", "does": "When a bullet's figures are tied to a past period (e.g. '+4.9% "
             "FY2024' read years later) I flag it and can look up the current numbers on the web, explain what I "
             "found and why, and propose an updated bullet — I apply it and you can Undo."},
            {"label": "Versions", "does": "Switch, rename, or activate a saved version — every change saves one, "
             "so any edit is one tap to undo."},
        ],
        # Work Highlights is a SEPARATE page, not part of the default right-pane view — the
        # assistant works in the right pane; open this when you want to paste big notes.
        "pages": [
            {"label": "Work Highlights", "view": "work_highlights",
             "does": "A separate page: paste big notes, brags, or data dumps and I extract and synthesize "
             "evidence you can work into a bullet. Your experience library — open it when you need it."},
        ],
        "offers": [
            _offer("Want me to review your whole résumé, section by section?", "review_document", {}),
            _offer("Want me to review your summary and flag anything out of date?", "review_summary", {}),
            _offer("Want me to walk the document section by section?", "focus_document",
                   {"section": "documents", "mode": "section", "target": "summary", "highlight": True}),
            _offer("I spotted dated figures — refresh them from the web?", "refresh_metric", {}),
            _offer("Sharpen a bullet?", "start_playbook", {"playbook": "bullets"}),
            _offer("Tailor it to a job?", "start_playbook", {"playbook": "tailor"}),
        ],
        "steps": [
            {"say": "Here's your whole document, centered. It has a Summary, Experience, Education, and Skills — "
                    "tell me a section and I'll take you right to it.",
             "highlight": "Document"},
            {"say": "Say 'go to Experience' (or any section) and I scroll to it and highlight it. 'Highlight "
                    "leadership' or 'where does it say Education' spotlights an exact word or line — for a cover "
                    "letter I'll find and highlight the paragraph.",
             "highlight": "Section map"},
            {"say": "Point me at any single bullet and I'll read it, then suggest real improvements to that line — "
                    "a stronger rewording, a cleaner rephrase, or a work highlight folded in. You edit the draft; "
                    "it only changes when you approve.",
             "highlight": "Bullet workbench"},
            {"say": "I keep your Summary honest — I read what it actually says, call out what's weak or out of "
                    "date, and propose a tighter version from your own résumé. I'll nudge you to refresh it after "
                    "a big change so it never goes stale.",
             "highlight": "Summary health"},
            {"say": "If a bullet's numbers are tied to an old year, I'll flag it, look up the current figure on the "
                    "web, tell you what I found and why, apply the update — and you can Undo if you don't like it.",
             "highlight": "Refresh figures"},
        ],
        # Marquee readouts — resolvable from the résumé itself (GET /resumes/{id}) so the
        # marquee always renders. The richer signals (section count, summary freshness,
        # dated-figure count) come from the /map and /summary-review endpoints and are NOT
        # marquee readouts (they'd force extra fetches the marquee can't assume).
        "readouts": [
            {"key": "version", "label": "Version", "source": "active_version", "highlight": "Versions"},
            {"key": "score", "label": "Score", "source": "quality_grade", "highlight": "Document"},
        ],
        # Optional, fetched-on-demand signals (not part of the marquee).
        "signals": [
            {"key": "sections", "label": "Sections", "source": "map.stats.sections", "highlight": "Section map"},
            {"key": "summary_fresh", "label": "Summary freshness", "source": "summary.fresh",
             "highlight": "Summary health"},
            {"key": "flagged", "label": "Dated figures to refresh", "source": "map.stats.flagged",
             "highlight": "Refresh figures"},
        ],
    },
    "connect": {
        "purpose": "Connect the email accounts and job boards Project Harbor pulls jobs from.",
        "current": "the selected connected source",
        "walkthrough": "connect_source",
        "actions": [
            _action("Connect an email account", "connect", ["email", "source"], "start_playbook", {"playbook": "connect_source"}),
            _action("Remove a source", "remove", ["email", "source"], "navigate", {"section": "connect", "manage": "remove"},
                    confirm="Disconnect this source?"),
        ],
        "controls": [
            {"label": "Add email source", "does": "Connect a mailbox (Gmail/iCloud/Outlook). Up to 5 sources."},
            {"label": "Connected list", "does": "Your connected addresses — remove any to free a slot."},
        ],
        "offers": [
            _offer("Want me to walk you through connecting an email account?",
                   "start_playbook", {"playbook": "connect_source"}),
        ],
        # Ordered walkthrough the generic runtime narrates + highlights, step by step
        # (so the connect flow never goes silent). Each step: say + what to highlight,
        # and wait=true where the user must act before continuing.
        "steps": [
            {"say": "This is Connect — where you add the email accounts Project Harbor pulls jobs from. You can connect up to 5.",
             "highlight": "Add email source"},
            {"say": "Start by tapping Add email source, then choose your provider — Gmail, iCloud, or Outlook.",
             "highlight": "Add email source"},
            {"say": "You'll sign in on the provider's own page and approve read access. I never see or handle your password — you sign in yourself.",
             "highlight": "Add email source", "wait": True},
            {"say": "Once it's connected, your address shows up in your connected list here. Add another any time, up to 5.",
             "highlight": "Connected list"},
        ],
        # Count of connected sources (length of GET /integrations), capped at 5.
        "readouts": [
            {"key": "connected", "label": "Connected sources", "source": "length", "highlight": "Connected list"},
        ],
        "limits": {"email_sources": 5},
    },
    "auto_apply": {
        "purpose": "Let the assistant fill and queue applications for you — you approve before anything sends.",
        "current": None,
        "walkthrough": "auto_apply",
        "actions": [
            _action("Set up auto-apply", "connect", ["auto_apply"], "start_playbook", {"playbook": "auto_apply"}),
        ],
        "controls": [
            {"label": "Enable auto-apply", "does": "Turn on queued applications; each still needs your OK."},
            {"label": "Daily/weekly limits", "does": "How many auto-applies run per day and week."},
        ],
        "offers": [
            _offer("Want me to walk you through setting up auto-apply?",
                   "start_playbook", {"playbook": "auto_apply"}),
        ],
        "steps": [
            {"say": "This is Auto-apply — I can fill and queue applications for you, and you approve each one before it sends.",
             "highlight": "Enable auto-apply"},
            {"say": "Turn on Enable auto-apply to start queuing. Nothing sends without your OK.",
             "highlight": "Enable auto-apply", "wait": True},
            {"say": "Set your daily and weekly limits so it only applies as often as you want.",
             "highlight": "Daily/weekly limits"},
        ],
    },
    "interview": {
        "purpose": "Practice interviews with spoken questions and feedback.",
        "current": None,
        "walkthrough": "practice",
        "actions": [
            _action("Practice an interview", "walk", ["interview"], "start_playbook", {"playbook": "practice"}),
        ],
        "controls": [
            {"label": "Start practice", "does": "Begin a mock interview; answer by voice."},
        ],
        "offers": [
            _offer("Want to run a quick practice interview?", "start_playbook", {"playbook": "practice"}),
        ],
        "steps": [
            {"say": "This is interview practice — I'll ask questions out loud and give you feedback.",
             "highlight": "Start practice"},
            {"say": "Tap Start practice and answer by voice whenever you're ready.",
             "highlight": "Start practice", "wait": True},
        ],
    },
    "inbox": {
        "purpose": "Job-alert emails you forwarded, with the roles pulled out.",
        "current": "the open message",
        "walkthrough": None,
        "actions": [
            _action("Import a job email", "connect", ["email"], "navigate", {"section": "inbox"}),
        ],
        "controls": [
            {"label": "Forwarding address", "does": "Forward board alerts here to ingest their jobs."},
        ],
        "offers": [
            _offer("Want your forwarding address to pull jobs from email alerts?",
                   "navigate", {"section": "inbox"}),
        ],
        "steps": [
            {"say": "This is your inbox — job-alert emails you forward here get their roles pulled out automatically.",
             "highlight": "Forwarding address"},
            {"say": "Forward board alerts to your forwarding address and the jobs show up in your matches.",
             "highlight": "Forwarding address"},
        ],
    },
}


def for_section(section: str) -> Optional[dict[str, Any]]:
    """The manifest entry for a section, with its aliases filled in from the NLU."""
    cap = CAPABILITIES.get((section or "").lower())
    if cap is None:
        return None
    return {"section": section.lower(), "aliases": _aliases(section.lower()), **cap}


def arrival_brief(section: str) -> Optional[dict[str, Any]]:
    """Everything the generic guide-on-arrival needs for a section: purpose, the things
    you can do (action labels), the primary controls to highlight, the walkthrough to
    offer, and the next-step offers to arm. The client renders/speaks this — no
    feature-specific prose anywhere."""
    cap = for_section(section)
    if cap is None:
        return None
    return {
        "section": cap["section"],
        "purpose": cap["purpose"],
        "current": cap.get("current"),
        "can_do": [a["label"] for a in cap.get("actions", [])],
        "controls": cap.get("controls", []),
        # Separate pages reachable from the section (not part of the default pane), [] if none.
        "pages": cap.get("pages", []),
        "walkthrough": cap.get("walkthrough"),
        "steps": cap.get("steps", []),
        "readouts": cap.get("readouts", []),
        # Optional, fetched-on-demand signals (not marquee readouts); [] when none.
        "signals": cap.get("signals", []),
        "offers": cap.get("offers", []),
        # P275: how to behave on arrival (open at the top, read its map, let focus follow
        # the work) and where the live structure/analysis lives, so the client never defaults to the
        # bullet pane or "what would you like to do here?".
        "arrival": cap.get("arrival"),
        # The chip set for the currently selected line (documents): the genuinely useful
        # moves in priority order; [] where a section has none.
        "line_actions": cap.get("line_actions", []),
        "data": cap.get("data"),
    }


def is_destructive(verb: str) -> bool:
    """Whether an action built from this verb must confirm before running (P180)."""
    return (verb or "").lower() in DESTRUCTIVE_VERBS


def manifest() -> dict[str, Any]:
    """The whole capability manifest, JSON-serializable, for ``GET /assistant/capabilities``.
    One declarative description of every feature the assistant behaves over."""
    return {
        "version": VERSION,
        "behaviors": list(BEHAVIORS),
        # Where the assistant lives + renders (P279): the right pane is home; results never
        # surface in a floating window, at the top of the page, or as a random popout.
        "surface": dict(SURFACE),
        # Proactive once-per-session scan (P281): call this on landing with a stable
        # session_id; it returns a prioritized brief the assistant raises on its own.
        "session_scan": {
            "endpoint": "/api/v1/assistant/session-scan",
            "cadence": "once_per_session",
            "raises": ["severe_error", "reportable", "activity"],
        },
        # Action awareness (P328): when the user clicks any of these controls THEMSELVES,
        # the client POSTs {action,label} here and speaks the returned acknowledgement +
        # offer, so the assistant is never a silent bystander to what the user does. Any
        # action id works (unknown ones get a graceful generic line); these are the ones
        # with tailored responses the client should wire first.
        "observe": {
            "endpoint": "/api/v1/assistant/observe",
            "trigger": "on_direct_user_action",
            "actions": sorted(ACTION_ACKS),
            "aliases": dict(ACTION_ALIASES),
        },
        "verbs": {k: list(v) for k, v in VERBS.items()},
        "destructive_verbs": sorted(DESTRUCTIVE_VERBS),
        "playbooks": sorted(_PLAYBOOKS),
        "sections": [for_section(s) for s in CAPABILITIES],
        # Scripted interim narration per flow state + spoken answers to anticipated
        # mid-flow questions, so the client speaks every step and never falls silent (P252).
        "flows": {k: {kk: (dict(vv) if isinstance(vv, dict) else vv) for kk, vv in v.items()}
                  for k, v in FLOWS.items()},
        "flow_faq": dict(FLOW_FAQ),
        # The full keyword/intent index: every phrasing the assistant understands, so it
        # can match and compare user input to a real capability (not just the current
        # section's actions).
        "catalog": command_catalog(),
    }
