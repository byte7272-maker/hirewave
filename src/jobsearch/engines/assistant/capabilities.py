"""Assistant capability manifest — describe a feature once, inherit every behavior.

Prompts P179–P200 each hand-specified the assistant's behavior for one feature. But
they are all instances of the SAME small set of generic behaviors:

  * guide-on-arrival   — fires on EVERY navigation (never silent/collapsed): announce the
                         section, point at the focal point, and offer a relevant action.
                         Adaptive — skip the static greeting for a frequent/active user and
                         go straight to the announce + offer; don't repeat the same greeting
  * recognize          — a verb (connect/add/remove/change/show/walk/tailor/research/…)
                         + an object resolves to one action
  * pending-offer      — every yes/no question arms a concrete follow-up; "yes" runs it
  * confirm-destructive— any action marked destructive confirms before it runs
  * highlight + dock    — point at the element being discussed; keep it visible; HOLD the
                         position + highlight until the user acts or a timeout expires
                         (don't snap back and cover the target); interruptible at once.
                         Focus granularity: a request to SHOW a specific document or
                         explicit value → center THAT item; a request for a LIST → focus
                         the section, not one row
  * speak-on-update    — narrate whenever the overlay text changes (every screen); SPEAK
                         every walkthrough step's `say` as it highlights/advances (and on
                         Next) — never highlight a step silently; guide tasks end to end
  * surface-choices    — offered options render in view/reachable; an unobtrusive cue
                         (a pulsing arrow) signals content below the fold
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
    "highlight_and_dock", "speak_on_update", "surface_choices", "narrate_values",
    "error_aware", "one_source_of_truth",
]

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
        "purpose": "Your résumés and cover letters — pick one to review, edit, tailor, or use to apply.",
        "current": "the open document and its active version; résumé unless a cover letter is shown",
        "walkthrough": None,
        "actions": [
            _action("Show my résumé", "show", ["resume"], "navigate", {"section": "documents", "doc": "resume"}),
            _action("Show my cover letter", "show", ["cover_letter"], "navigate", {"section": "documents", "doc": "cover_letter"}),
            _action("Review it", "walk", ["document"], "start_playbook", {"playbook": "bullets"}),
            _action("Edit it", "change", ["document"], "navigate", {"section": "documents"},
                    confirm="Apply this change to your document?"),
            _action("Tailor it to a job", "tailor", ["document"], "start_playbook", {"playbook": "tailor"}),
            _action("Change the design", "change", ["design"], "start_playbook", {"playbook": "design"},
                    destructive=False),
            _action("Update it on my job sites", "change", ["document", "boards"], "sync_documents", {},
                    destructive=False),
        ],
        "controls": [
            {"label": "Document preview", "does": "Shows the current document; it centers and highlights on open."},
            {"label": "Ask AI", "does": "Describe a change in words; it edits the document (you confirm)."},
            {"label": "Versions", "does": "Switch, rename, or activate a saved version."},
        ],
        "offers": [
            _offer("Review it", "start_playbook", {"playbook": "bullets"}),
            _offer("Modify it", "navigate", {"section": "documents"}),
            _offer("Use it for a job application", "start_playbook", {"playbook": "apply_job"}),
            _offer("Tailor it to a job", "start_playbook", {"playbook": "tailor"}),
        ],
        "steps": [
            {"say": "This is your document, shown exactly as it renders.",
             "highlight": "Document preview"},
            {"say": "Describe any change in plain words and I'll make it — you confirm before it's applied.",
             "highlight": "Ask AI"},
            {"say": "Every change saves its own version, so you can switch back any time.",
             "highlight": "Versions"},
        ],
        # Read from the current résumé (GET /resumes/{id}).
        "readouts": [
            {"key": "version", "label": "Version", "source": "active_version", "highlight": "Versions"},
            {"key": "score", "label": "Score", "source": "quality_grade", "highlight": "Document preview"},
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
        "walkthrough": cap.get("walkthrough"),
        "steps": cap.get("steps", []),
        "readouts": cap.get("readouts", []),
        "offers": cap.get("offers", []),
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
        "verbs": {k: list(v) for k, v in VERBS.items()},
        "destructive_verbs": sorted(DESTRUCTIVE_VERBS),
        "playbooks": sorted(_PLAYBOOKS),
        "sections": [for_section(s) for s in CAPABILITIES],
        # The full keyword/intent index: every phrasing the assistant understands, so it
        # can match and compare user input to a real capability (not just the current
        # section's actions).
        "catalog": command_catalog(),
    }
