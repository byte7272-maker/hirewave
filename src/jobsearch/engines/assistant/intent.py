"""Assistant NLU — turn a free-form utterance into a structured intent.

Interpretation only: this maps what the user *said* onto the P121 command set, the
P115 playbooks, the app sections and the bullet flow. It never executes anything —
the API layer runs the (already guarded) action. A deterministic matcher covers the
whole command set with no LLM; an optional LLM backstop handles free-form phrasing
when one is configured. See ``docs/ASSISTANT_INTENT.md``.
"""

from __future__ import annotations

import difflib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional

# ---- taxonomy --------------------------------------------------------------

#: Every intent the endpoint can return.
INTENTS = {
    "confirm", "decline",
    "stop", "pause", "continue", "next", "back", "repeat", "skip", "cancel",
    "choose", "navigate", "start_playbook", "save", "search_jobs", "research_company",
    "read_options", "what_can_i_do",
    "read_bullets", "suggest_bullets", "use_bullet", "discard_bullet",
    "change_voice", "set_rate",
    "check_mic", "check_audio", "status_report", "whats_new", "resume_task",
    "report_state", "ask", "unknown",
}

#: App sections a user can be sent to (slot ``section``), with spoken synonyms.
_SECTIONS = {
    "matches": ("matches", "match", "my jobs", "jobs", "job matches", "roles"),
    "documents": ("documents", "document", "my files", "files", "resume", "résumé",
                  "resumes", "cover letter", "cover letters", "my documents"),
    "auto_apply": ("auto apply", "auto-apply", "autoapply", "apply bot", "automation"),
    "design": ("design", "styles", "style", "templates", "template", "look"),
    "interview": ("interview", "interviews", "practice interview", "practice", "mock interview"),
    # connect is matched BEFORE inbox so "the email connect section" / "email sources"
    # resolves to the sources page, not the mail inbox (both mention "email").
    "connect": ("connect", "connections", "integrations", "sources", "email sources",
                "email source", "job sources", "accounts"),
    "inbox": ("inbox", "email", "mailbox"),
    "community": ("community", "people"),
    "dashboard": ("dashboard", "home", "overview"),
}

#: P115 playbooks (slot ``playbook``), with spoken synonyms.
_PLAYBOOKS = {
    "connect_source": ("connect a source", "connect my email", "connect email", "connect gmail",
                       "connect icloud", "connect outlook", "add a job source", "connect a job source",
                       "connect a new email account", "add an email account", "add an email address",
                       "add a new email", "link my email", "set up an email", "add an email source",
                       "use my email for applications", "connect an email account"),
    "auto_apply": ("set up auto apply", "auto apply", "apply for me", "automate applications",
                   "automate applying"),
    "walk_matches": ("walk through my matches", "walk my matches", "go through my matches",
                     "review my matches", "which jobs fit", "rate my matches", "score my matches",
                     "rank my matches", "grade my matches", "rate my jobs", "score my jobs",
                     "how do my matches rank", "how good are my matches"),
    "apply_job": ("apply to this job", "apply to a job", "apply to this one", "fill this application",
                  "help me apply"),
    "upload": ("upload a document", "upload my resume", "upload my résumé", "upload a cover letter",
               "upload a file", "import a document"),
    "download": ("download", "download this", "get a pdf", "get a word copy", "export",
                 "open in google docs"),
    "design": ("design my document", "change the design", "which template", "pick a style",
               "make it look better"),
    "tailor": ("tailor my resume", "tailor my résumé", "tailor to a job", "aim my resume",
               "tailor my cover letter"),
    "practice": ("practice an interview", "practice interview", "rehearse", "mock interview"),
    "bullets": ("make bullets", "bullet workshop", "work highlights", "my work highlights",
                "turn this into bullets", "build bullets"),
}

_FILLER = re.compile(
    r"\b(please|could you|can you|would you|um+|uh+|like|just|hey|okay so|so|well)\b",
    re.I,
)
# Ordinal words only — NOT bare cardinals like "one"/"two", which are usually nouns
# here ("that one", "the one about X") rather than a position.
_ORDINALS = {
    "first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3,
    "fourth": 4, "4th": 4, "fifth": 5, "5th": 5, "last": -1,
}


@dataclass
class IntentResult:
    intent: str = "unknown"
    confidence: float = 0.0
    slots: dict[str, Any] = field(default_factory=dict)
    reply: str = ""
    needs_disambiguation: list[dict[str, str]] = field(default_factory=list)
    utterance: str = ""
    #: When the utterance wasn't understood, the nearest wordings that WOULD be —
    #: so the assistant can suggest phrasing it can act on. Each item: {text,intent,slots}.
    suggestions: list[dict[str, Any]] = field(default_factory=list)


def _norm(text: str) -> str:
    text = (text or "").strip().lower()
    # Drop apostrophes so contractions collapse ("can't" -> "cant"), not split.
    text = text.replace("'", "").replace("’", "")
    text = _FILLER.sub(" ", text)
    text = re.sub(r"[^\w\s%$+./-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _contains_any(text: str, phrases) -> bool:
    return any(p in text for p in phrases)


def _token_overlap(a: str, b: str) -> float:
    ta, tb = set(re.findall(r"\w+", a.lower())), set(re.findall(r"\w+", b.lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _best_option(text: str, options: list[dict]) -> tuple[Optional[dict], float]:
    """Fuzzy-match the utterance to one of the on-screen options by label."""
    best, score = None, 0.0
    for o in options or []:
        label = str(o.get("label", ""))
        s = max(_token_overlap(text, label),
                difflib.SequenceMatcher(None, text, label.lower()).ratio())
        if s > score:
            best, score = o, s
    return best, score


def _resolve_reference(text: str, context: dict) -> tuple[Optional[str], Optional[int], list[dict]]:
    """Resolve 'that one' / an ordinal / a label to an (option_id, index) from context.

    Returns (option_id, index, disambiguation_options).
    """
    options = list(context.get("options") or [])
    # explicit ordinal / number ("the second one", "number 3", "bullet 3", "line 3")
    m = re.search(r"\b(?:number|option|#|bullet|line|item)\s*(\d+)\b", text) or re.search(r"\b(\d+)\b", text)
    idx = None
    if m:
        idx = int(m.group(1))
    else:
        for word, n in _ORDINALS.items():
            if re.search(rf"\b{re.escape(word)}\b", text):
                idx = n
                break
    if idx is not None and options:
        i = (len(options) + idx) if idx < 0 else (idx - 1)
        if 0 <= i < len(options):
            return str(options[i].get("id")), i, []
    # demonstrative ("that one", "this", "it") → the focused/only option
    if re.search(r"\b(that one|this one|that|this|it)\b", text):
        fi = context.get("focused_index")
        if isinstance(fi, int) and options and 0 <= fi < len(options):
            return str(options[fi].get("id")), fi, []
        if len(options) == 1:
            return str(options[0].get("id")), 0, []
        if options:
            return None, None, options  # ambiguous → disambiguate
    # label match
    opt, score = _best_option(text, options)
    if opt and score >= 0.34:
        return str(opt.get("id")), options.index(opt), []
    return None, None, []


def _match_section(text: str) -> Optional[str]:
    for key, syns in _SECTIONS.items():
        if _contains_any(text, syns):
            return key
    return None


def _doc_target(text: str) -> Optional[str]:
    """Which document the user named within the Documents section — so a nav command
    opens the right one. 'cover letter' wins over 'resume' when both appear."""
    if re.search(r"cover\s*-?\s*letter", text):
        return "cover_letter"
    if re.search(r"\b(resume|résumé|resumé|cv)\b", text):
        return "resume"
    return None


def _match_playbook(text: str) -> Optional[str]:
    best, score = None, 0.0
    for key, syns in _PLAYBOOKS.items():
        for s in syns:
            r = _token_overlap(text, s)
            if s in text:
                r = max(r, 0.9)
            if r > score:
                best, score = key, r
    return best if score >= 0.5 else None


_JOB_NOUN_RE = re.compile(r"\b(jobs?|roles?|positions?|openings?|listings?|postings?|vacanc(?:y|ies)|gigs?)\b")
_SEARCH_VERB_RE = re.compile(r"\b(find|search|look for|look up|filter|get me|show me all|show all|list all)\b")
# "<job noun> that/which/with/for/titled/…" — a filter clause attached to a job noun.
_SEARCH_CLAUSE_RE = re.compile(
    r"\b(jobs?|roles?|positions?|openings?|listings?|postings?)\s+(that|which|with|for|titled|called|matching|like|about|in)\b"
)


_GENERIC_WALK_RE = re.compile(
    r"\b(walk|take|run|guide|lead) me through\b"
    r"|\bwalk through\b|\brun through\b|\bgo through (these|them|it|this|the)\b"
    r"|\bfrom the top\b|\bstart over\b|\bstart from (the )?(top|beginning|start)\b"
    r"|\b(one by one|one at a time)\b|\btake me through\b"
)


def _generic_walk(t: str) -> bool:
    """True for a 'walk/take me through / from the top / start over / go through these'
    request that names no specific target — resolve it against the current screen."""
    return bool(_GENERIC_WALK_RE.search(t))


_RESEARCH_TRIG_RE = re.compile(
    r"\b(tell me about|what do you know about|look .{0,20}up|look up|research|who (?:is|are)|"
    r"info(?:rmation)? on|background on|details on|learn about|whats? .{0,20}like to work)\b"
)
_COMPANY_CTX_RE = re.compile(
    r"\bthis (?:company|employer|place|one|job|role|match)\b|\bthe (?:company|employer)\b"
    r"|\bthis match\b|\btop (?:match|job)\b|\bthem\b|\bit up\b"
)
_COMPANY_WORD_RE = re.compile(r"\b(compan(?:y|ies)|employer|headquarter|stock|reviews?|ceo|leadership)\b")


def _research_company(t: str) -> Optional[str]:
    """If this is a 'look up / tell me about a company' request, return the company name
    (``""`` = resolve from context — the focused/top-matched company), else None.
    Rejects document/section/job-search phrasings so it doesn't hijack those."""
    m = _RESEARCH_TRIG_RE.search(t)
    if not m:
        return None
    if _COMPANY_CTX_RE.search(t):
        return ""  # "this company" / "the top match" → frontend resolves from context
    residual = t[m.end():].strip(" ?.!,")
    residual = re.sub(r"\b(the|a|an|company|employer|please|more|some|info|details)\b", " ", residual)
    residual = re.sub(r"\s+", " ", residual).strip()
    # A job search ("research VP jobs") or a doc/section is not company research.
    if _JOB_NOUN_RE.search(t) or _match_section(residual) or _doc_target(residual):
        return None
    if _COMPANY_WORD_RE.search(t) and not residual:
        return ""  # "look up the company" with no name → context
    return residual or None


# --- manage a resource: connect / add / remove / change -----------------------
# A general verb+object layer so "connect a new email account", "add an email source",
# "disconnect my inbox", "replace the email on my résumé" all resolve to the right
# action instead of falling through. The three verb classes map to: add->connect_source
# playbook, remove/change of a SOURCE->the connect section (to manage it), and change of
# a field ON a document->open that document for an edit.
_MANAGE_ADD_RE = re.compile(
    r"\b(connect|add|link|hook ?up|set ?up|sign ?in|attach|re-?connect|enroll)\b"
)
_MANAGE_REMOVE_RE = re.compile(
    r"\b(remove|disconnect|unlink|detach|revoke|delete|get rid of|take off)\b"
)
_MANAGE_CHANGE_RE = re.compile(
    r"\b(change|switch|replace|update|swap|edit|modify|fix|correct)\b"
)
# "use/put/set …" is an implied change when it targets a field/document ("use a
# different email address on my résumé") — not a connect verb.
_MANAGE_SET_RE = re.compile(r"\b(use|put|set|make)\b")
# The thing being managed.
_EMAIL_OBJ_RE = re.compile(r"\b(e-?mail|mailbox|gmail|icloud|outlook|inbox|hotmail|yahoo)\b")
# An email ADDRESS is a contact FIELD ("my email address", "my email") — it lives on a
# document/profile, NOT a connected source. This is the key distinction the user asked
# for: "replace my email address" edits the résumé; "connect an email account" adds a
# source.
_EMAIL_ADDRESS_RE = re.compile(r"\bemail address(?:es)?\b|\bmy e-?mail\b")
# Providers named as an ACCOUNT to connect.
_PROVIDER_RE = re.compile(r"\b(gmail|icloud|outlook|yahoo|hotmail)\b")
_SOURCE_OBJ_RE = re.compile(
    r"\b(source|sources|integration|integrations|connection|connections|account|accounts|provider|feed)\b"
)
# Document/profile CONTEXT — "on/in my résumé", "used on the resume", "in my cover letter".
_DOC_CTX_RE = re.compile(
    r"\b(resume|résumé|resumé|cv|cover\s*-?\s*letter|document|profile)\b"
)
# An explicit "go/take/bring me to / open / show / switch to" means the user wants to
# NAVIGATE — so "bring me to the email connect section" is a nav, even though it
# contains the word "connect". (The document-edit case is resolved before this guard.)
_NAV_VERB_RE = re.compile(
    r"\b(go to|take me to|bring me to|navigate|pull up|open|show me|show my|switch to)\b"
)


def _manage_action(t: str, context: dict) -> Optional[IntentResult]:
    """Resolve an explicit connect/add/remove/change request to a concrete action.

    - add/connect an email or source  -> start the ``connect_source`` playbook
    - remove/change a source/account   -> navigate to the connect section to manage it
    - change/replace an email FIELD ON a document -> open that document to edit it
    Returns None when there is no management verb, or no recognizable object.
    """
    add = bool(_MANAGE_ADD_RE.search(t))
    rem = bool(_MANAGE_REMOVE_RE.search(t))
    chg = bool(_MANAGE_CHANGE_RE.search(t))
    setv = bool(_MANAGE_SET_RE.search(t))
    if not (add or rem or chg or setv):
        return None
    email = bool(_EMAIL_OBJ_RE.search(t))
    is_source = bool(_SOURCE_OBJ_RE.search(t)) or bool(_PROVIDER_RE.search(t))
    address = bool(_EMAIL_ADDRESS_RE.search(t))
    doc = _doc_target(t)
    doc_ctx = bool(doc) or bool(_DOC_CTX_RE.search(t))
    # "use/put/set" counts as an edit only when it targets a field or a document.
    edit_field = (chg or rem) or (setv and (address or (email and doc_ctx)))

    # 1) An email ADDRESS (a contact field), or any email edit scoped to a document,
    #    is a DOCUMENT edit — not a source. "replace my email address" / "change the
    #    email on my résumé" / "use a different email address on my résumé" open the doc
    #    and hand the frontend the instruction for Ask-AI (it confirms before applying,
    #    P180). This is the distinction the user asked for, and it must open the user's
    #    CURRENT résumé, never a sample. A connect/add verb is always a SOURCE action,
    #    so the address->document branch only fires for an edit verb, or when a document
    #    is named explicitly ("add my email to my résumé").
    if (edit_field and address and not is_source) or (email and doc_ctx and (chg or rem or add or setv)):
        return IntentResult(
            "navigate", 0.85,
            {"section": "documents", "doc": doc or "resume", "edit": t},
        )

    # An explicit navigation verb ("bring me to the email connect section") means GO
    # there — let the navigate matcher resolve the section (connect wins over inbox now).
    if _NAV_VERB_RE.search(t):
        return None

    # 2) Connect / add an email ACCOUNT or a job source -> the connect playbook.
    if add and (is_source or email):
        return IntentResult("start_playbook", 0.85, {"playbook": "connect_source"})

    # 3) Remove / change an email ACCOUNT or source -> the connect section (manage).
    if (rem or chg) and is_source:
        return IntentResult(
            "navigate", 0.85,
            {"section": "connect", "manage": "remove" if rem else "change"},
        )

    # 4) Bare, ambiguous email change ("change the email") with no address/source/doc
    #    signal -> ask which they mean instead of guessing wrong (the reported bug).
    if (chg or rem) and email and not address and not is_source and not doc_ctx:
        return IntentResult(
            "ask", 0.7, {"clarify": "email_target"},
            reply="Do you mean the email address on your résumé, or an email account "
                  "you connect as a source?",
        )
    return None


# --- "read me this page" — run through all the live values -------------------
# "what's on my dashboard", "run through the tallies", "read me the numbers" → report
# the WHOLE page (every readout), like the marquee, not just the section's purpose.
_PAGE_SUMMARY_RE = re.compile(
    r"\bwhat'?s?\s+(?:on|is on)\b.*\b(?:dashboard|page|screen)\b"
    r"|\b(?:run|go|walk|take me|read)\s+(?:me\s+)?through\b.*\b(?:dashboard|page|numbers?|totals?|tall(?:y|ies)|metrics|stats|everything|each)\b"
    r"|\bread\s+(?:me\s+)?(?:the\s+|my\s+)?(?:dashboard|page|numbers?|totals?|tall(?:y|ies)|metrics|stats)\b"
    r"|\bwhat\s+are\s+(?:my|the)\s+(?:numbers?|totals?|tall(?:y|ies)|metrics|stats)\b"
    r"|\b(?:go|run)\s+through\s+(?:each|all|the)\s+(?:tall(?:y|ies)|sections?|numbers?|metrics)\b",
    re.I,
)


def _page_summary(t: str) -> bool:
    """True for a 'read me this whole page / run through the tallies' request — answered
    by narrating every readout for the current section (narrate_values), not a purpose blurb."""
    return bool(_PAGE_SUMMARY_RE.search(t))


# --- factual state questions ("what version is this?") ------------------------
# A question about the CURRENT state must be ANSWERED, not turned into a navigate or a
# highlight. Recognize "what/which/how many … <state noun>" and report the field.
_STATE_Q_RE = re.compile(r"\b(what'?s?|which|how many|how much|do i have|tell me (?:the|my|how))\b")


def _state_query(t: str, context: dict) -> Optional[IntentResult]:
    """Map an introspective question about current state to ``report_state`` with the
    field to answer (version/score/matches/document), else None. The frontend answers it
    from context + the API (e.g. the résumé's active version), speaking the answer."""
    if not _STATE_Q_RE.search(t):
        return None
    if re.search(r"\bversions?\b", t):
        return IntentResult("report_state", 0.9, {"field": "version"})
    if re.search(r"\b(score|grade|rating)\b", t):
        return IntentResult("report_state", 0.9, {"field": "score"})
    if re.search(r"\bmatch(?:es)?\b", t) and re.search(r"\b(how many|number|count|do i have)\b", t):
        return IntentResult("report_state", 0.9, {"field": "matches"})
    # "which résumé is this", "what document am I on / showing"
    if (_doc_target(t) or re.search(r"\bdocument\b", t)) and re.search(r"\b(this|on|am i|current|showing|open)\b", t):
        return IntentResult("report_state", 0.9, {"field": "document"})
    return None


def _extract_search_query(t: str) -> Optional[str]:
    """If ``t`` is a job-search request, return the cleaned query (OR-joined), else None.

    Recognizes a search verb ("find/search/list …"), a filter clause ("jobs that are …"),
    or a keyword+job-noun phrase ("VP roles"). Defers to playbooks and to document/section
    navigation so "which jobs fit" (a playbook) and "find my résumé" (nav) aren't hijacked."""
    if not (_SEARCH_VERB_RE.search(t) or _SEARCH_CLAUSE_RE.search(t) or _JOB_NOUN_RE.search(t)):
        return None
    # A concrete playbook phrase ("which jobs fit", "rate my jobs") wins over search.
    if _match_playbook(t):
        return None
    from jobsearch.engines.sourcing.job_query import parse_alternatives

    alts = parse_alternatives(t)
    query = " or ".join(alts).strip()
    if len(query) < 2:
        return None
    # If what's left is really a section/document ("find my résumé", "show matches"),
    # let the navigation matcher handle it instead of searching for that word.
    if _match_section(query) or _doc_target(query):
        return None
    return query


# ---- deterministic matcher -------------------------------------------------

def _deterministic(text: str, context: dict) -> IntentResult:
    t = text
    has = lambda *w: _contains_any(t, w)  # noqa: E731

    # flow control (check multi-word / specific first)
    if has("never mind", "nevermind", "forget it"):
        return IntentResult("cancel", 0.9)
    if re.fullmatch(r"(stop|halt|quiet|be quiet|shush)", t) or has("stop talking", "stop reading"):
        return IntentResult("stop", 0.95)
    if re.fullmatch(r"(pause|hold on|wait)", t):
        return IntentResult("pause", 0.9)
    if has("go back", "previous", "back up") or re.fullmatch(r"back", t):
        return IntentResult("back", 0.9)
    if re.fullmatch(r"(next|continue|go on|keep going|carry on|resume|move on)", t) or has(
        "next one", "keep going", "go on", "move on"
    ):
        return IntentResult("next" if "next" in t else "continue", 0.9)
    if re.fullmatch(r"(repeat|again|say that again|one more time)", t) or has("say that again",
                                                                             "repeat that"):
        return IntentResult("repeat", 0.9)
    if re.fullmatch(r"skip", t) or has("skip this", "skip that", "skip it"):
        return IntentResult("skip", 0.85)
    if re.fullmatch(r"(cancel|abort)", t):
        return IntentResult("cancel", 0.9)

    # voice / rate (before navigate, so "switch to coral" isn't a section)
    if has("faster", "speed up", "talk faster", "quicker"):
        return IntentResult("set_rate", 0.9, {"direction": "faster"})
    if has("slower", "slow down", "talk slower"):
        return IntentResult("set_rate", 0.9, {"direction": "slower"})
    m = re.search(r"(?:speed|rate)\D{0,6}(\d(?:\.\d)?)", t)
    if m:
        return IntentResult("set_rate", 0.9, {"rate": float(m.group(1))})
    m = re.search(r"\b(?:voice|sound)\b", t)
    if m and (has("change", "switch", "use", "different", "warmer", "friendl") or "voice to" in t):
        vm = re.search(r"(?:to|use)\s+(?:the\s+)?([a-z]+)", t) or re.search(r"([a-z]+)\s+voice", t)
        name = vm.group(1) if vm else ""
        slots = {"voice": name} if name and name not in (
            "the", "a", "my", "voice", "sound", "change", "switch", "different"
        ) else {}
        return IntentResult("change_voice", 0.85, slots)

    # bullet actions
    if has("read them", "read these", "read the bullets", "read my bullets", "read the suggestions"):
        return IntentResult("read_bullets", 0.9)
    if has("which should", "which one should", "which bullet", "recommend a bullet", "suggest a bullet",
           "which do you") or re.fullmatch(r"(suggest|recommend|which one)", t):
        return IntentResult("suggest_bullets", 0.85)
    if has("discard", "drop that", "drop it", "remove that", "not that one", "reject"):
        oid, idx, _ = _resolve_reference(t, context)
        slots = {k: v for k, v in (("option_id", oid), ("index", idx)) if v is not None}
        return IntentResult("discard_bullet", 0.85, slots)
    # "use/add/pick …" selects a bullet — but NOT when the phrase is about an email
    # address or a document field ("use a different email address on my résumé"), which
    # is a document edit handled by _manage_action below.
    _bullet_use = (has("use ", "use that", "use this", "use it", "add that", "add this",
                       "pick that", "pick this", "go with that", "go with this")
                   or re.fullmatch(r"(use|add|pick)(\s+it)?", t))
    if _bullet_use and not (_EMAIL_ADDRESS_RE.search(t) or _DOC_CTX_RE.search(t)):
        oid, idx, dis = _resolve_reference(t, context)
        if dis:
            return IntentResult("use_bullet", 0.6, {}, needs_disambiguation=dis)
        slots = {k: v for k, v in (("option_id", oid), ("index", idx)) if v is not None}
        return IntentResult("use_bullet", 0.9 if oid else 0.7, slots)

    # manage a resource ("connect a new email account", "add an email source",
    # "disconnect my inbox", "replace the email on my résumé") — an explicit
    # connect/add/remove/change verb + an object. Checked before research/search/navigate
    # so the user's intent to USE the app's basic services is honored by voice or text.
    ma = _manage_action(t, context)
    if ma is not None:
        return ma

    # research a company ("tell me about Acme", "look up this company", "research the top
    # match") — distinct from a job search. company="" means resolve from context (the
    # focused / top-matched company). Checked before job-search and navigate.
    rc = _research_company(t)
    if rc is not None:
        return IntentResult("research_company", 0.85, {"company": rc})

    # job search ("find all jobs that are vice president or VP", "remote senior python
    # roles") — a free-text query with OR-alternatives + synonym expansion. Checked
    # before navigate so "find VP jobs" searches rather than just opening the jobs list,
    # but it defers to playbooks and to section/document nav (see _extract_search_query).
    sq = _extract_search_query(t)
    if sq:
        return IntentResult("search_jobs", 0.85, {"query": sq})

    # navigate ("go to / take me to / open <section>") — a nav verb + a section wins
    # over the playbook matcher, so "go to auto apply" navigates but "set up auto
    # apply" starts the playbook. When the section is Documents, carry WHICH document
    # the user named (cover letter vs résumé) so "go to my cover letter" opens the cover
    # letter, not whatever doc is showing.
    if has("go to", "take me to", "open", "show me", "show my", "switch to", "navigate",
           "bring me to", "pull up"):
        sec = _match_section(t)
        if sec:
            slots: dict[str, Any] = {"section": sec}
            if sec == "documents":
                dt = _doc_target(t)
                if dt:
                    slots["doc"] = dt
            return IntentResult("navigate", 0.9, slots)

    # save / bookmark the current job ("save this one for later", "bookmark it")
    if has("save this", "save it", "save the job", "save for later", "save this one",
           "bookmark", "add to saved", "add to my saved"):
        return IntentResult("save", 0.9)

    # refresh / reload a section ("refresh my matches", "reload matches", "update my
    # jobs") — an explicit refresh verb navigates there and refreshes it. It must NOT be
    # read as the "walk through my matches" playbook (the grand tour the user did not
    # ask for): "refresh my matches" token-overlaps "review my matches" otherwise.
    if has("refresh", "reload", "re-load", "re-fresh") or re.search(r"\bupdate my\b", t):
        sec = _match_section(t)
        if sec:
            return IntentResult("navigate", 0.9, {"section": sec, "refresh": True})

    # --- audio hardware diagnostics (mic input + speaker output) --------------
    # Triggers the connectivity troubleshooting guide. "you can't hear me" points at
    # the mic; "I can't hear you / no sound" points at the speakers; a general
    # "hardware/audio/sound check" or any speaker mention runs the full check.
    _hw_verb = ("check", "test", "connect", "working", "work", "troubleshoot", "detect",
                "set up", "setup", "problem", "issue", "not working", "isnt working",
                "enabled", "on or off")
    if has("cant hear me", "you cant hear", "you cannot hear", "not hearing me"):
        return IntentResult("check_mic", 0.9)
    if has("cant hear you", "i cant hear", "no sound", "nothing plays", "cant hear anything"):
        return IntentResult("check_audio", 0.9)
    if (re.search(r"\b(speakers?|sound|hardware)\b", t) and has(*_hw_verb)) or has(
        "hardware check", "audio check", "sound check", "audio setup", "check my audio",
        "test my audio", "test the audio", "check the audio"
    ):
        return IntentResult("check_audio", 0.9)
    if re.search(r"\b(mic|microphone|headset|headphone)s?\b", t) and has(*_hw_verb):
        return IntentResult("check_mic", 0.9)

    # status report / progress ("give me a status report", "how am I doing")
    if has("status report", "full status", "status update", "progress report", "my progress",
           "how am i doing", "where things stand", "where do things stand", "summarize my",
           "give me a summary", "catch me up", "brief me"):
        return IntentResult("status_report", 0.9)

    # what changed since last time
    if has("what's changed", "whats changed", "what has changed", "what changed",
           "what's new", "whats new", "anything new", "since last login", "since last time",
           "since i was last", "since i was here", "while i was away", "what did i miss"):
        return IntentResult("whats_new", 0.9)

    # resume an in-progress task ("pick up where I left off") — NOT the résumé document
    if has("pick up where", "where i left off", "where we left off", "resume my task",
           "resume where", "continue where i left off", "continue my task", "last session",
           "finish what i started", "back to what i was", "what i was doing"):
        return IntentResult("resume_task", 0.9)

    # "read me this page" ("what's on my dashboard", "run through the tallies") — report
    # the WHOLE page: narrate every readout + the current document, like the marquee.
    if _page_summary(t):
        return IntentResult("report_state", 0.9, {"field": "page"})

    # factual state question ("what version is this?", "what's my score", "how many
    # matches do I have?") — ANSWER it; don't navigate or highlight. Checked before the
    # fuzzy playbook/selection matchers so a question isn't mistaken for a command.
    sq_state = _state_query(t, context)
    if sq_state is not None:
        return sq_state

    # playbooks (a concrete task phrase)
    pb = _match_playbook(t)
    if pb:
        # Guard the fuzzy 'walk_matches' match from stealing a request that names a
        # DIFFERENT target — "walk me through my resume" token-overlaps "walk through my
        # matches" but is about the résumé, not the matches.
        _other_section = _match_section(t) not in (None, "matches")
        if pb == "walk_matches" and (_doc_target(t) or _other_section):
            pass
        else:
            return IntentResult("start_playbook", 0.85, {"playbook": pb})

    # Generic walkthrough with NO named target ("walk me through from the top",
    # "from the top", "start over", "go through these one by one") — resolve against the
    # CURRENT screen so it doesn't fall through to a default route (which sent it to
    # Documents). On Matches it walks the matches from the top-ranked.
    if _generic_walk(t) and not _match_section(t) and not _doc_target(t):
        section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
        if "match" in section:
            return IntentResult("start_playbook", 0.8, {"playbook": "walk_matches"})

    # options / help
    if has("what can i do", "read my options", "what are my options", "my options", "what now",
           "help me", "options") or re.fullmatch(r"(help|options|menu)", t):
        return IntentResult("read_options", 0.85)

    # yes / no — last among short commands so specific verbs win first
    if re.fullmatch(
        r"(yes|yeah|yep|yup|sure|ok|okay|do it|go|go ahead|confirm|sounds good|please do|absolutely|"
        r"that works|correct|right)",
        t,
    ) or has("do it", "go ahead", "sounds good", "yes please"):
        return IntentResult("confirm", 0.9)
    if re.fullmatch(r"(no|nope|nah|dont|do not|not now|no thanks|negative)", t) or has(
        "no thanks", "not now", "dont do"
    ):
        return IntentResult("decline", 0.9)

    # bare selection ("the second one", "that one") without an action verb
    oid, idx, dis = _resolve_reference(t, context)
    if dis:
        return IntentResult("choose", 0.6, {}, needs_disambiguation=dis)
    if oid is not None or idx is not None:
        slots = {k: v for k, v in (("option_id", oid), ("index", idx)) if v is not None}
        return IntentResult("choose", 0.8, slots)

    return IntentResult("unknown", 0.0)


# ---- optional LLM backstop -------------------------------------------------

_LLM_SYSTEM = (
    "You classify a job-search app user's utterance into one intent. "
    "Output ONLY JSON: {\"intent\": <one of the list>, \"confidence\": 0..1, \"slots\": {}}. "
    "No prose."
)


def _llm_classify(text: str, context: dict, llm) -> Optional[IntentResult]:
    try:
        prompt = (
            "Intents: " + ", ".join(sorted(INTENTS)) + ".\n"
            "Sections: " + ", ".join(_SECTIONS) + ". Playbooks: " + ", ".join(_PLAYBOOKS) + ".\n"
            "slots may include: section, playbook, voice, rate, index, query.\n"
            f"Utterance: {text!r}\nReturn JSON only."
        )
        raw = llm.complete(prompt, system=_LLM_SYSTEM, max_tokens=200, temperature=0.0)
        start, end = raw.find("{"), raw.rfind("}")
        data = json.loads(raw[start:end + 1]) if start != -1 and end != -1 else {}
        intent = str(data.get("intent", "")).strip()
        if intent not in INTENTS:
            return None
        conf = float(data.get("confidence", 0.6) or 0.6)
        slots = data.get("slots") if isinstance(data.get("slots"), dict) else {}
        return IntentResult(intent, max(0.5, min(conf, 0.95)), slots)
    except Exception:  # noqa: BLE001 - never let the backstop raise
        return None


# ---- suggestible commands --------------------------------------------------
# Canonical example commands the assistant can offer, each tagged with the screens
# it's useful on ("*" = everywhere). Every one is VERIFIED to parse (see
# ``_verified`` / ``suggest_commands``), so the assistant only ever suggests wording
# it can actually understand and act on — the point of "suggest wording it can
# understand as well".
_SUGGESTIONS: list[tuple[str, tuple[str, ...]]] = [
    # global — always safe to offer
    ("What can I do?", ("*",)),
    ("Give me a status report", ("*",)),
    ("What's new since last time?", ("*",)),
    ("Check my microphone", ("*",)),
    ("Check my audio", ("*",)),
    ("Talk slower", ("*",)),
    # matches
    ("Refresh my matches", ("matches",)),
    ("Rate my matches", ("matches",)),
    ("Which jobs fit?", ("matches",)),
    ("Walk me through my matches", ("matches",)),
    ("Apply to this job", ("matches", "job")),
    ("Tailor my résumé to this job", ("matches", "job")),
    ("Save this one for later", ("matches", "job")),
    # documents
    ("Open my documents", ("documents", "dashboard")),
    ("Tailor my résumé", ("documents",)),
    ("Make bullets from my work", ("documents",)),
    ("Change the design", ("documents",)),
    ("Improve my résumé", ("documents",)),
    # getting around
    ("Take me to my matches", ("documents", "dashboard", "interview", "inbox")),
    ("Set up auto apply", ("dashboard", "auto_apply")),
    ("Connect my email", ("dashboard", "connect")),
    ("Practice an interview", ("dashboard", "interview")),
]


def _as_dict(text: str, r: IntentResult) -> dict[str, Any]:
    return {"text": text, "intent": r.intent, "slots": dict(r.slots)}


def _verified(text: str, context: dict) -> Optional[IntentResult]:
    """Parse *text* and return the result only if it maps to a real, actionable
    command (not ``unknown``/``ask``) — the guarantee behind every suggestion."""
    r = _deterministic(_norm(text), context or {})
    return r if r.intent not in ("unknown", "ask") else None


def _screen(context: Optional[dict]) -> str:
    context = context or {}
    scr = str(context.get("section") or context.get("page") or "").lower()
    if context.get("job_id") and "job" not in scr:
        scr = f"{scr} job".strip()
    return scr


def _relevant(tags: tuple[str, ...], screen: str) -> bool:
    if "*" in tags:
        return True
    return bool(screen) and any(t and (t in screen or screen.startswith(t)) for t in tags)


def suggest_commands(context: Optional[dict] = None, *, limit: int = 6) -> list[dict[str, Any]]:
    """Example commands to offer on the current screen — screen-specific first, then
    a couple of global ones. Every returned item is verified wording the NLU
    understands, so the assistant can safely say "try: …"."""
    context = context or {}
    screen = _screen(context)
    specific: list[dict[str, Any]] = []
    general: list[dict[str, Any]] = []
    seen: set[str] = set()
    for text, tags in _SUGGESTIONS:
        if text.lower() in seen:
            continue
        is_specific = "*" not in tags and _relevant(tags, screen)
        is_global = "*" in tags
        if not (is_specific or is_global):
            continue
        r = _verified(text, context)
        if r is None:
            continue
        seen.add(text.lower())
        (specific if is_specific else general).append(_as_dict(text, r))
    return (specific + general)[:limit]


def nearest_commands(
    transcript: str, context: Optional[dict] = None, *, limit: int = 3
) -> list[dict[str, Any]]:
    """For an utterance that wasn't understood, the closest wordings that WOULD be —
    ranked by similarity to what the user said — so the assistant can offer a
    "did you mean…" instead of failing."""
    context = context or {}
    raw = _norm(transcript)
    if not raw:
        return suggest_commands(context, limit=limit)
    screen = _screen(context)
    scored: list[tuple[float, dict[str, Any]]] = []
    seen: set[str] = set()
    for text, tags in _SUGGESTIONS:
        if text.lower() in seen:
            continue
        r = _verified(text, context)
        if r is None:
            continue
        seen.add(text.lower())
        cand = _norm(text)
        sim = max(_token_overlap(raw, cand),
                  difflib.SequenceMatcher(None, raw, cand).ratio())
        if _relevant(tags, screen):
            sim += 0.15  # prefer on-screen commands on a tie
        scored.append((sim, _as_dict(text, r)))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [d for _, d in scored[:limit]]


# ---- public API ------------------------------------------------------------

def interpret(
    transcript: str, *, context: Optional[dict] = None, llm=None, threshold: float = 0.6
) -> IntentResult:
    """Classify *transcript* into an :class:`IntentResult`.

    ``context`` carries light page state (``page``, ``resume_id``, ``focused_index``,
    ``options``) so references like "that one" resolve. ``llm`` (optional) is only used
    as a backstop when the deterministic pass is below ``threshold``.
    """
    context = context or {}
    raw = (transcript or "").strip()
    text = _norm(raw)
    if not text:
        return IntentResult("unknown", 0.0, utterance=raw)

    result = _deterministic(text, context)

    if result.confidence < threshold:
        if llm is not None:
            llm_res = _llm_classify(raw, context, llm)
            if llm_res is not None and llm_res.confidence >= result.confidence:
                result = llm_res
        # Still weak? Treat a substantive utterance as a free-form request.
        if result.confidence < threshold and result.intent in ("unknown",):
            if len(text.split()) >= 2:
                result = IntentResult("ask", 0.5, {"query": raw})

    # When we couldn't pin a concrete command, offer the nearest wordings we DO
    # understand, so the assistant suggests phrasing it can act on instead of a dead end.
    if result.intent in ("unknown", "ask"):
        result.suggestions = nearest_commands(raw, context)

    result.utterance = raw
    return result
