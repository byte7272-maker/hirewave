"""Activity recall + app-function catalog for the assistant.

Pure functions over a list of :class:`ActivityEvent`, plus a static catalog of the
app's major functions. The assistant uses these to answer, in plain language and in
different forms:

* counts     — "how many times have I tailored a résumé?"  → 4
* subjects   — "which résumés have I worked on?"           → a list with per-item counts
* recency    — "what have I done lately with my résumé?"   → recent events, by topic
* functions  — "what can you do?" / "what does this app do?" → the catalog

Deterministic (no LLM): the phrasing is templated so it is stable and testable.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable, Optional

from jobsearch.models.activity import TOPICS, VERBS
from jobsearch.models.common import utcnow


# --- the app's major functions (what the assistant knows the app can do) -----------
#: Each entry: a stable key, a short title, a plain-language blurb, and the topic it
#: belongs to (so "what can you do with my résumé" can filter by topic).
FUNCTIONS: list[dict] = [
    {"key": "matches", "topic": "matches", "title": "Find & rank job matches",
     "blurb": "I score open roles against your résumé and preferences and show the strongest fits first."},
    {"key": "tailor", "topic": "documents", "title": "Tailor your résumé to a job",
     "blurb": "I rewrite your résumé for a specific posting, keeping your real experience and surfacing the relevant parts."},
    {"key": "cover_letter", "topic": "documents", "title": "Draft cover letters",
     "blurb": "I write and revise a cover letter for a role from your background."},
    {"key": "review", "topic": "documents", "title": "Review & grade documents",
     "blurb": "I review a résumé or cover letter and point out concrete improvements."},
    {"key": "versions", "topic": "documents", "title": "Keep résumé versions",
     "blurb": "I save tailored variants you can switch between, so you reuse the right one per job."},
    {"key": "sync", "topic": "sync", "title": "Keep your résumé current across job sites",
     "blurb": "I put your latest résumé onto the job sites you use — or hand you the file and steps — and track which site has which version."},
    {"key": "apply", "topic": "applications", "title": "Fill applications",
     "blurb": "On an application page I fill your own saved details for you to review and submit — never your password, and I never submit for you."},
    {"key": "track", "topic": "applications", "title": "Track applications",
     "blurb": "I keep the status of each application (submitted, interviewing, offer) so you can see where things stand."},
    {"key": "research", "topic": "research", "title": "Research employers",
     "blurb": "With your go-ahead I look a company up on the open web and summarize useful facts to tailor your application."},
    {"key": "interview", "topic": "interview", "title": "Practice interviews",
     "blurb": "I run mock interviews and keep answers you want to reuse."},
    {"key": "search", "topic": "search", "title": "Search & save jobs",
     "blurb": "I search boards, remember what you looked for, and let you save jobs to come back to."},
]


def functions_overview(topic: str = "") -> dict:
    """The app's major functions, optionally filtered to one topic. Returns a
    plain-language reply plus the structured list."""
    items = [f for f in FUNCTIONS if not topic or f["topic"] == topic]
    if not items:
        items = FUNCTIONS
    titles = [f["title"] for f in items]
    if topic and topic in TOPICS:
        lead = f"For {TOPICS[topic]}, I can: " + _join(titles) + "."
    else:
        lead = "Here's what I can do: " + _join(titles) + "."
    return {"reply": lead, "form": "functions",
            "functions": [{"title": f["title"], "blurb": f["blurb"], "topic": f["topic"]} for f in items]}


# --- filtering + aggregation -------------------------------------------------------
def filter_events(
    events: Iterable, *, subject_type: str = "", subject_id: str = "",
    topic: str = "", verb: str = "", since: Optional[datetime] = None,
) -> list:
    """Return events matching every provided filter, newest first."""
    out = []
    for e in events:
        if subject_type and e.subject_type != subject_type:
            continue
        if subject_id and e.subject_id != subject_id:
            continue
        if topic and e.topic != topic:
            continue
        if verb and e.verb != verb:
            continue
        if since and e.at < since:
            continue
        out.append(e)
    out.sort(key=lambda e: e.at, reverse=True)
    return out


def summarize(events: list) -> dict:
    """Aggregate events into counts by verb, subject, and topic, plus the recent list."""
    by_verb: dict[str, int] = {}
    by_topic: dict[str, int] = {}
    subjects: dict[str, dict] = {}
    for e in events:
        by_verb[e.verb] = by_verb.get(e.verb, 0) + 1
        by_topic[e.topic] = by_topic.get(e.topic, 0) + 1
        if e.subject_id:
            key = f"{e.subject_type}:{e.subject_id}"
            s = subjects.setdefault(key, {
                "subject_type": e.subject_type, "subject_id": e.subject_id,
                "label": e.subject_label, "count": 0, "last_at": e.at})
            s["count"] += 1
            if e.subject_label and not s["label"]:
                s["label"] = e.subject_label
            if e.at > s["last_at"]:
                s["last_at"] = e.at
    ordered = sorted(subjects.values(), key=lambda s: (s["count"], s["last_at"]), reverse=True)
    recent = sorted(events, key=lambda e: e.at, reverse=True)[:10]
    return {
        "total": len(events),
        "by_verb": by_verb,
        "by_topic": by_topic,
        "subjects": ordered,
        "recent": recent,
    }


# --- natural-language answering ----------------------------------------------------
_VERB_SYNONYMS = {
    "tailored": ["tailor", "tailored", "customi"],
    "edited": ["edit", "edited", "chang", "updat", "revis", "tweak"],
    "applied": ["appl"],
    "synced": ["sync", "upload to", "update.*site", "push.*site", "on the site"],
    "downloaded": ["download"],
    "reviewed": ["review", "grade", "critiqu"],
    "created": ["create", "made", "new résumé", "new resume"],
    "generated": ["generate", "generated"],
    "versioned": ["version"],
}
_TOPIC_SYNONYMS = {
    "documents": ["résumé", "resume", "cv", "cover letter", "document"],
    "applications": ["application", "applied", "apply", "applying"],
    "matches": ["match", "job fit", "ranked"],
    "sync": ["sync", "job site", "board", "keep.*current", "up to date"],
    "interview": ["interview", "practice"],
    "search": ["search", "saved job"],
    "research": ["research", "employer", "company"],
}
_SUBJECT_SYNONYMS = {
    "cover_letter": ["cover letter"],
    "resume": ["résumé", "resume", "cv"],
    "application": ["application", "applied"],
    "job": ["job", "match", "role", "position"],
}
_CAPABILITY_RE = re.compile(
    r"\b(what can (you|this|the app|it)|what do you do|what are (the|your) (feature|function|capabilit)|"
    r"what('?s| is) possible|help me understand|how can you help|what('?s| is) this app)\b", re.I)
_COUNT_RE = re.compile(r"\b(how many|how often|how much|number of|count|times)\b", re.I)
_WHICH_RE = re.compile(r"\b(which|what) (résumés?|resumes?|cvs?|documents?|cover letters?)\b", re.I)
_RECENT_RE = re.compile(
    r"\b(recent|lately|latest|so far|history|activity|what have i|what did i|last (few|couple|several|\d+)|"
    r"this week|today|up to now|been (up to|doing)|track record)\b", re.I)


def _match(text: str, table: dict) -> str:
    for key, pats in table.items():
        for p in pats:
            if re.search(p, text, re.I):
                return key
    return ""


def answer(query: str, events: list, *, form: str = "") -> dict:
    """Answer a plain-language question about the user's activity or the app's
    functions. ``form`` optionally forces a shape ("count"|"list"|"recent"|"summary"|
    "functions"); otherwise it is inferred from the query. Returns
    {reply, form, data} — always a usable, honest answer, even with no activity."""
    q = (query or "").strip()
    verb = _match(q, _VERB_SYNONYMS)
    topic = _match(q, _TOPIC_SYNONYMS)
    subject_type = _match(q, _SUBJECT_SYNONYMS)

    # 1) Capability / "what can you do" — doesn't need any activity.
    if form == "functions" or (not form and _CAPABILITY_RE.search(q) and not _RECENT_RE.search(q)):
        return functions_overview(topic if topic in TOPICS else "")

    scoped = filter_events(
        events, verb=verb, topic=(topic if not subject_type else ""),
        subject_type=subject_type)

    # 2) Count — "how many times have I tailored a résumé?"
    if form == "count" or (not form and _COUNT_RE.search(q)):
        n = len(scoped)
        what = _count_phrase(verb, subject_type, topic)
        reply = f"You've {what} {_times(n)}." if n else f"You haven't {what} yet."
        return {"reply": reply, "form": "count", "count": n,
                "filters": {"verb": verb, "subject_type": subject_type, "topic": topic}}

    # 3) Which subjects — "which résumés have I worked on?"
    if form == "list" or (not form and _WHICH_RE.search(q)):
        st = subject_type or "resume"
        summary = summarize([e for e in events if e.subject_type == st])
        subs = summary["subjects"]
        noun = st.replace("_", " ")
        if not subs:
            return {"reply": f"You haven't worked on any {noun} yet.", "form": "list", "subjects": []}
        names = [f'{s["label"] or "untitled"} ({_times(s["count"])})' for s in subs[:6]]
        reply = f"You've worked on {len(subs)} {noun}{'s' if len(subs) != 1 else ''}: " + _join(names) + "."
        return {"reply": reply, "form": "list", "subjects": subs}

    # 4) Recent / history — "what have I done lately (with my résumé)?"
    if form == "recent" or (not form and _RECENT_RE.search(q)) or verb or topic or subject_type:
        recent = scoped[:8] if scoped else filter_events(events)[:8]
        if not recent:
            return {"reply": "No activity recorded yet — once you start, I'll keep track.",
                    "form": "recent", "events": []}
        scope = ""
        if topic in TOPICS:
            scope = f" on {TOPICS[topic]}"
        elif subject_type:
            scope = f" with your {subject_type.replace('_', ' ')}"
        lead = f"Recently{scope}: " + _join([_recent_phrase(e) for e in recent]) + "."
        return {"reply": lead, "form": "recent", "events": [_event_row(e) for e in recent]}

    # 5) Default — an overall summary.
    s = summarize(events)
    if not s["total"]:
        return {"reply": "No activity recorded yet — once you start tailoring résumés and applying, I'll track it here.",
                "form": "summary", "summary": s | {"recent": [], "subjects": []}}
    topics = sorted(s["by_topic"].items(), key=lambda kv: kv[1], reverse=True)
    topic_bits = [f"{n} on {TOPICS.get(t, t)}" for t, n in topics[:3]]
    recent = [_recent_phrase(e) for e in s["recent"][:3]]
    reply = (f"You've taken {_times(s['total'])} in total — " + _join(topic_bits) + ". "
             + "Most recently: " + _join(recent) + ".")
    return {"reply": reply, "form": "summary",
            "summary": {"total": s["total"], "by_verb": s["by_verb"], "by_topic": s["by_topic"],
                        "subjects": s["subjects"][:6], "recent": [_event_row(e) for e in s["recent"]]}}


# --- phrasing helpers --------------------------------------------------------------
def _times(n: int) -> str:
    return "once" if n == 1 else ("twice" if n == 2 else f"{n} times") if n else "0 times"


def _join(parts: list) -> str:
    parts = [p for p in parts if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def _count_phrase(verb: str, subject_type: str, topic: str) -> str:
    v = VERBS.get(verb, verb) if verb else "done things"
    if subject_type:
        noun = "a résumé" if subject_type == "resume" else f"a {subject_type.replace('_', ' ')}"
        return f"{v} {noun}" if verb else f"done things with your {subject_type.replace('_', ' ')}"
    if topic in TOPICS:
        return f"{v} ({TOPICS[topic]})" if verb else f"done things with {TOPICS[topic]}"
    return v if verb else "taken any actions"


def _relative(at: datetime) -> str:
    now = utcnow()
    secs = max(0, (now - at).total_seconds())
    if secs < 90:
        return "just now"
    mins = secs / 60
    if mins < 60:
        return f"{int(mins)} min ago"
    hrs = mins / 60
    if hrs < 24:
        return f"{int(hrs)}h ago"
    days = hrs / 24
    if days < 2:
        return "yesterday"
    if days < 7:
        return f"{int(days)} days ago"
    return at.strftime("%b %-d") if hasattr(at, "strftime") else ""


def _recent_phrase(e) -> str:
    try:
        rel = _relative(e.at)
    except Exception:  # noqa: BLE001
        rel = ""
    base = e.phrase()
    return f"{base} ({rel})" if rel else base


def _event_row(e) -> dict:
    return {
        "verb": e.verb, "subject_type": e.subject_type, "subject_id": e.subject_id,
        "subject_label": e.subject_label, "topic": e.topic, "detail": e.detail,
        "at": e.at.isoformat() if hasattr(e.at, "isoformat") else str(e.at),
        "phrase": e.phrase(),
    }
