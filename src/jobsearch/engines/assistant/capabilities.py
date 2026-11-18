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
  * confirm-destructive— only a truly IRREVERSIBLE action (permanent delete, send, connect/
                         disconnect an account) confirms. A reversible edit does NOT prompt —
                         see undo-over-confirm
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
    "never": ["top_of_page", "random_popout", "obstruct_content", "bury_in_floating_window"],
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

#: Verbs whose actions change or destroy data — the client must confirm before running
#: (P180). Used generically: any action built from one of these is destructive.
DESTRUCTIVE_VERBS = {"remove", "change"}

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
    'remove'/'change' action auto-confirms unless explicitly overridden."""
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
        # centers the whole document and gives a one-line map of its sections (from
        # GET /resumes|cover-letters/{id}/map), then offers the first useful move.
        "arrival": {
            "center": "document",  # center the full document, not the bullet pane
            "map": True,           # read the section outline so the assistant knows the whole doc
            "announce": "whole_document",
        },
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
            _action("Show my résumé", "show", ["resume"], "navigate", {"section": "documents", "doc": "resume"}),
            _action("Show my cover letter", "show", ["cover_letter"], "navigate", {"section": "documents", "doc": "cover_letter"}),
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
        # P275: how to behave on arrival (center the whole document, read its map) and
        # where the live structure/analysis lives, so the client never defaults to the
        # bullet pane or "what would you like to do here?".
        "arrival": cap.get("arrival"),
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
