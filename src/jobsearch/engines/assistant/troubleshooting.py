"""Troubleshooting database + error handling for the assistant.

A small, curated catalog of the failures and undesirable events this app actually
hits, each with: a quick user-friendly acknowledgment, the plain-language cause, the
actionable fix, and whether the assistant should retry / ask again. Deterministic (no
LLM) so acknowledgments are instant and stable.

Design goals (from the product):
* The assistant acknowledges an error FAST and in plain language.
* It NEVER goes silent on a bad mic read or nonsensical input — it always asks again.
* Mic/garbled input is a prompt to re-ask, not an error to swallow.
"""

from __future__ import annotations

import re
from typing import Iterable, Optional

#: The catalog. Each entry:
#:   ack       — a short spoken line the assistant says immediately
#:   cause     — plain-language why it happened (for the log + a "why" follow-up)
#:   fix       — the concrete thing to do about it
#:   retry     — the same action is worth retrying automatically
#:   ask_again — the assistant should re-prompt the user (mic/garbled/unclear)
TROUBLESHOOTING: dict[str, dict] = {
    # --- voice / input: never go silent, always re-ask -----------------------------
    "mic_no_input": {
        "ack": "I didn't hear anything — go ahead when you're ready.",
        "cause": "The microphone didn't pick up any speech.",
        "fix": "Check the mic is on and try again, or type your request.",
        "retry": False, "ask_again": True,
    },
    "mic_unintelligible": {
        "ack": "Sorry, I didn't catch that — could you say it again?",
        "cause": "I couldn't make out what was said.",
        "fix": "Repeat it, or type it so I get it right.",
        "retry": False, "ask_again": True,
    },
    "mic_muted": {
        "ack": "You might not be able to hear me — the page is muted.",
        "cause": "The device/browser muted this page's audio (common on iPhone).",
        "fix": "On iPhone: flip the side Silent switch OFF (orange = silent), and tap the "
               "speaker/unmute control on the page. On desktop: unmute the tab.",
        "retry": False, "ask_again": False,
    },
    "mic_blocked": {
        "ack": "I can't use the microphone — it's blocked for this site.",
        "cause": "Safari blocks the mic for a website until you allow it (it is NOT under "
                 "Settings → Privacy → Microphone, which only lists installed apps).",
        "fix": "Allow it in Safari: tap the ‘aA’ button at the left of the address bar → "
               "Website Settings → Microphone → Allow (and Camera if asked). Or globally: "
               "Settings → Safari → Microphone → Ask. Then reload. You can also just type to me.",
        "retry": False, "ask_again": False,
    },
    "mic_unsupported": {
        "ack": "Voice isn't available in this browser — you can type instead.",
        "cause": "This browser doesn't support in-page speech recognition (e.g. iOS Safari).",
        "fix": "Type your request in the box; everything works by typing.",
        "retry": False, "ask_again": False,
    },
    "nonsense_input": {
        "ack": "I'm not sure what you meant there — can you rephrase?",
        "cause": "The input didn't match anything I can act on.",
        "fix": "Say it a different way, or ask what I can do.",
        "retry": False, "ask_again": True,
    },
    "empty_input": {
        "ack": "Did you want to ask me something?",
        "cause": "No text or speech came through.",
        "fix": "Type or say your request.",
        "retry": False, "ask_again": True,
    },
    # --- extension / sync ----------------------------------------------------------
    "not_linked": {
        "ack": "The extension isn't linked to your account yet.",
        "cause": "Project Harbor Connect hasn't received your account token.",
        "fix": "Open Project Harbor (or use the extension popup's Link button) to link it.",
        "retry": False, "ask_again": False,
    },
    "no_site_access": {
        "ack": "The extension can't act on this site yet.",
        "cause": "Site access isn't granted for this job board.",
        "fix": "Open the extension popup → 'Enable on your job sites' (or set access to 'On all sites').",
        "retry": False, "ask_again": False,
    },
    "no_resume_file": {
        "ack": "I don't have a résumé to use here.",
        "cause": "No résumé is uploaded or generated yet.",
        "fix": "Upload or generate a résumé first, then try again.",
        "retry": False, "ask_again": False,
    },
    "attach_failed": {
        "ack": "This site wouldn't take the file directly.",
        "cause": "The site opens its own file picker instead of an attachable field.",
        "fix": "Use the Download button + the upload steps to add it by hand.",
        "retry": False, "ask_again": False,
    },
    # --- document assistant: navigate / refresh figures / summary review -------------
    "no_document_text": {
        "ack": "I can't read this document yet.",
        "cause": "There's no readable text — it may be an image-only PDF or still processing.",
        "fix": "Re-upload it as a text PDF, DOCX, or TXT, and I'll map and work it.",
        "retry": False, "ask_again": False,
    },
    "locate_no_match": {
        "ack": "I couldn't find that in your document.",
        "cause": "The word or phrase I searched for isn't in the current text.",
        "fix": "Check the spelling, or tell me a different word or section to jump to.",
        "retry": False, "ask_again": False,
    },
    "no_sources_fetched": {
        "ack": "I didn't get any pages back to read.",
        "cause": "The web search returned no page text — the research step didn't run or the "
                 "browser extension isn't active.",
        "fix": "Run the search first (and make sure Project Harbor Connect is enabled with Web "
               "research on), then I'll propose an update from what the pages say.",
        "retry": True, "ask_again": False,
    },
    "metric_not_found": {
        "ack": "I couldn't find a clearer, newer figure for that.",
        "cause": "The pages I read didn't state an updated number I can stand behind.",
        "fix": "Point me at a specific page with the figure, or leave the bullet as it is.",
        "retry": False, "ask_again": False,
    },
    "no_summary": {
        "ack": "Your résumé doesn't have a summary yet.",
        "cause": "There's no summary section at the top to review.",
        "fix": "Add a 2–3 line summary — or say the word and I'll draft one from your experience.",
        "retry": False, "ask_again": False,
    },
    # --- network / server ----------------------------------------------------------
    "network": {
        "ack": "I lost the connection for a second.",
        "cause": "A network request didn't go through.",
        "fix": "I'll try again — check your connection if it keeps happening.",
        "retry": True, "ask_again": False,
    },
    "timeout": {
        "ack": "That's taking longer than it should — retrying.",
        "cause": "The request timed out.",
        "fix": "I'll retry automatically.",
        "retry": True, "ask_again": False,
    },
    "rate_limited": {
        "ack": "We're going a bit fast — give it a moment.",
        "cause": "Too many requests in a short time.",
        "fix": "Wait a few seconds and I'll try again.",
        "retry": True, "ask_again": False,
    },
    "permission_denied": {
        "ack": "I need your permission for that first.",
        "cause": "The action needs a consent you haven't granted.",
        "fix": "Grant the permission when I ask, then I can continue.",
        "retry": False, "ask_again": False,
    },
    "not_found": {
        "ack": "I couldn't find that.",
        "cause": "The item or page wasn't found.",
        "fix": "Double-check the name, or pick it from the list.",
        "retry": False, "ask_again": False,
    },
    "session_expired": {
        "ack": "Your sign-in expired.",
        "cause": "The session token is no longer valid.",
        "fix": "Sign in again (or re-open the app) and I'll pick up where we were.",
        "retry": False, "ask_again": False,
    },
    "unknown": {
        "ack": "Something went wrong on my end.",
        "cause": "An unexpected error occurred.",
        "fix": "I'll try again; if it persists, tell me what you were doing.",
        "retry": True, "ask_again": False,
    },
}

#: Keyword → kind, for classifying a raw message/status when no kind is given.
_SIGNATURES: list[tuple[str, str]] = [
    (r"not ?linked|no refresh|re-?link|link the extension", "not_linked"),
    (r"site access|not inject|on all sites|enable .* site", "no_site_access"),
    (r"no (résumé|resume)|résumé to|upload (or|a) résumé", "no_resume_file"),
    (r"picker|wouldn'?t (take|accept)|attach.*fail", "attach_failed"),
    # document assistant (check these before the generic not_found/network signatures)
    (r"no (readable )?(document |résumé |resume )?text|unreadable (document|résumé|resume|pdf)|"
     r"image-?only|can'?t read (the |this )?(document|résumé|resume|pdf)", "no_document_text"),
    (r"no (sources?|pages?) (back|fetched|returned)|no page text|nothing fetched|"
     r"search didn'?t run|research didn'?t run", "no_sources_fetched"),
    (r"no (newer|updated|current) (figure|number|metric)|couldn'?t find .*(figure|number|metric)|"
     r"metric.*not found|figure.*not found", "metric_not_found"),
    (r"no summary|summary (is )?(missing|empty)|without a summary|doesn'?t have a summary", "no_summary"),
    (r"(couldn'?t|could not|can'?t) (find|locate).*(word|phrase|section|in (the |your )?(document|résumé|resume))|"
     r"not (in|found in) (the |your )?(document|résumé|resume)|no match (in|for).*(document|text)", "locate_no_match"),
    (r"not-?allowed|service-?not-?allowed|audio-?capture|notallowed|permission.*(mic|microphone)|"
     r"(mic|microphone).*(denied|blocked|not allowed)|block.*mic", "mic_blocked"),
    (r"not ?support|unsupported|no ?speechrecognition|no-?recognition|webkitspeech.*undefined", "mic_unsupported"),
    (r"didn'?t (hear|catch)|no-?speech|no (speech|audio) input|mic.*no input", "mic_no_input"),
    (r"unintellig|couldn'?t make out|garbl", "mic_unintelligible"),
    (r"muted|silent switch|can'?t hear|no-?audio-?out|speaker", "mic_muted"),
    (r"\b(401|unauthor|expired|sign-?in expired)\b", "session_expired"),
    (r"\b(403|forbidden|permission|consent)\b", "permission_denied"),
    (r"\b(404|not found)\b", "not_found"),
    (r"\b(429|rate.?limit|too many)\b", "rate_limited"),
    (r"\b(timeout|timed out|504)\b", "timeout"),
    (r"\b(network|failed to fetch|connection|offline|502|503|500)\b", "network"),
    (r"nonsense|gibberish|doesn'?t make sense", "nonsense_input"),
    (r"^\s*$|empty", "empty_input"),
]


def classify(kind: str = "", message: str = "") -> str:
    """Resolve the troubleshooting key from an explicit kind, else from the message."""
    k = (kind or "").strip().lower()
    if k in TROUBLESHOOTING:
        return k
    text = f"{kind} {message}".lower()
    for pat, key in _SIGNATURES:
        if re.search(pat, text):
            return key
    return "unknown"


def lookup(kind: str, catalog: Optional[dict] = None) -> dict:
    """The catalog entry for a kind (falls back to 'unknown'). ``catalog`` lets a merged
    (override-applied) catalog be used instead of the static one."""
    cat = catalog or TROUBLESHOOTING
    return {"kind": kind, **cat.get(kind, cat.get("unknown", TROUBLESHOOTING["unknown"]))}


def acknowledge(kind: str = "", message: str = "", catalog: Optional[dict] = None) -> str:
    """The quick spoken acknowledgment line for a failure — never empty, so the
    assistant always says *something* rather than going silent."""
    return lookup(classify(kind, message), catalog)["ack"]


def handle(kind: str = "", message: str = "", context: str = "",
           catalog: Optional[dict] = None) -> dict:
    """Full handling for a failure: the acknowledgment, cause, fix, and whether to retry
    or ask again. ``reply`` is ready to speak (ack + fix for actionable errors).
    ``catalog`` applies runtime knowledge overrides when provided."""
    key = classify(kind, message)
    e = lookup(key, catalog)
    reply = e["ack"]
    # For an actionable (non-voice) error, append the fix so the user knows the next move.
    if e["fix"] and not e["ask_again"]:
        reply = f"{e['ack']} {e['fix']}"
    return {
        "kind": key,
        "reply": reply,
        "ack": e["ack"],
        "cause": e["cause"],
        "fix": e["fix"],
        "retry": e["retry"],
        "ask_again": e["ask_again"],
        "context": context,
    }


def search(query: str, limit: int = 8, catalog: Optional[dict] = None) -> list[dict]:
    """Search the troubleshooting database by plain-language query → matching entries,
    so the assistant (or a help page) can answer 'what does X mean / how do I fix Y'.
    ``catalog`` applies runtime knowledge overrides when provided."""
    cat = catalog or TROUBLESHOOTING
    q = (query or "").strip().lower()
    if not q:
        return [lookup(k, cat) for k in cat][:limit]
    scored: list[tuple[int, dict]] = []
    terms = [t for t in re.split(r"\W+", q) if t]
    best_kind = classify(q, q)  # the kind the query signatures point at
    for kind, e in cat.items():
        blob = f"{kind} {e.get('ack','')} {e.get('cause','')} {e.get('fix','')}".lower()
        score = sum(1 for t in terms if t in blob)
        if kind == best_kind and best_kind != "unknown":  # exact-kind boost
            score += 3
        if score:
            scored.append((score, lookup(kind, cat)))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [e for _, e in scored[:limit]]


def summarize(errors: Iterable) -> dict:
    """Aggregate recorded errors: counts by kind, and the recent list."""
    by_kind: dict[str, int] = {}
    items = list(errors)
    for e in items:
        by_kind[e.kind] = by_kind.get(e.kind, 0) + 1
    recent = sorted(items, key=lambda e: e.at, reverse=True)[:15]
    return {"total": len(items), "by_kind": by_kind, "recent": recent}


def row(e) -> dict:
    """Serialize one recorded error for an API/history view."""
    return {
        "kind": e.kind, "message": e.message, "context": e.context,
        "cause": e.cause, "fix": e.fix, "retry": e.retry, "ask_again": e.ask_again,
        "resolved": e.resolved,
        "at": e.at.isoformat() if hasattr(e.at, "isoformat") else str(e.at),
    }
