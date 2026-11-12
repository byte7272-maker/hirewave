"""Assistant capability manifest — describe a feature once, inherit every behavior.

Prompts P179–P200 each hand-specified the assistant's behavior for one feature. But
they are all instances of the SAME small set of generic behaviors:

  * guide-on-arrival   — on any navigate, say the section's purpose, what you can do,
                         offer a walkthrough, and highlight the primary control(s)
  * recognize          — a verb (connect/add/remove/change/show/walk/tailor/research/…)
                         + an object resolves to one action
  * pending-offer      — every yes/no question arms a concrete follow-up; "yes" runs it
  * confirm-destructive— any action marked destructive confirms before it runs
  * highlight + dock    — point at the element being discussed; keep it visible
  * speak-on-update    — narrate whenever the overlay text changes (every screen)
  * one-source-of-truth— "the current X" always resolves the same way everywhere

This module is the **single declarative place** those engines read. To give the
assistant full behavior on a NEW feature, add a :data:`CAPABILITIES` entry — no new
per-feature logic. The frontend drives guide/highlight/offer/confirm from the manifest
(served by ``GET /assistant/capabilities``); the NLU shares its section/object aliases
so recognition and guidance never diverge. See ``docs/ASSISTANT_CAPABILITIES.md``.
"""

from __future__ import annotations

from typing import Any, Optional

from jobsearch.engines.assistant.intent import _PLAYBOOKS, _SECTIONS

#: Manifest schema version — bump when the shape changes so the client can adapt.
VERSION = 1

#: The generic behaviors every feature inherits (documentation the client can render,
#: and the contract these engines honor). Flags, not free text, so the UI can key off them.
BEHAVIORS = [
    "guide_on_arrival", "recognize_verb_object", "pending_offer", "confirm_destructive",
    "highlight_and_dock", "speak_on_update", "one_source_of_truth",
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
        "offers": ["Want a quick status report?", "Want me to walk your top matches?"],
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
        "offers": ["Want me to walk your top matches?", "Research the top company?"],
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
        ],
        "controls": [
            {"label": "Document preview", "does": "Shows the current document; it centers and highlights on open."},
            {"label": "Ask AI", "does": "Describe a change in words; it edits the document (you confirm)."},
            {"label": "Versions", "does": "Switch, rename, or activate a saved version."},
        ],
        "offers": ["Review it", "Modify it", "Use it for a job application", "Tailor it to a job"],
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
        "offers": ["Want me to walk you through connecting an email account?"],
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
        "offers": ["Want me to walk you through setting up auto-apply?"],
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
        "offers": ["Want to run a quick practice interview?"],
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
        "offers": ["Want your forwarding address to pull jobs from email alerts?"],
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
    }
