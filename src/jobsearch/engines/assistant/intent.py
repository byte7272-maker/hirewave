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
    "web_search", "sync_documents", "archive", "edit_document",
    # within-document: jump to + highlight a section/keyword; refresh a stale metric from the
    # web; understand + freshness-check the summary; walk the WHOLE résumé section by section
    "focus_document", "refresh_metric", "review_summary", "review_document",
    "read_options", "what_can_i_do",
    # reaching a human expert (recruiter / hiring manager / HR pro) for advice or content —
    # a FUTURE feature; for now the assistant acknowledges it's coming soon.
    "connect_expert",
    "read_bullets", "suggest_bullets", "use_bullet", "discard_bullet",
    "change_voice", "set_rate",
    "check_mic", "check_audio", "status_report", "whats_new", "resume_task",
    # how to get MORE/BETTER matches — guidance toward the real levers: broaden the search
    # AND connect more sources (mailboxes + external job sites, incl. creating accounts).
    "more_matches",
    # advise what would make the résumé + SKILLSET stronger (general or for a role/job/goal):
    # skills, certifications, education, experience framing, positioning.
    "strengthen_resume",
    "report_state", "ask", "unknown",
}

#: App sections a user can be sent to (slot ``section``), with spoken synonyms.
_SECTIONS = {
    "matches": ("matches", "match", "my jobs", "jobs", "job matches", "roles"),
    "documents": ("documents", "document", "my files", "files", "resume", "résumé",
                  "resumes", "cover letter", "cover letters", "my documents"),
    # Applications = the tracker of jobs you've applied to. Listed BEFORE auto_apply so
    # "my applications" resolves here, not to the automation setup (they're distinct pages).
    "applications": ("applications", "my applications", "application tracker",
                     "applied jobs", "jobs i applied to", "submissions", "application status"),
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
    #: A yes/no offer to surface when the request is coherent but unrecognized — e.g.
    #: "want me to search the web for that?" {prompt, on_yes:{intent,slots}, yes, no}.
    offer: dict[str, Any] = field(default_factory=dict)
    #: Diagnostic trail (populated only when context asks for it): what the deterministic
    #: pass produced, whether/why the LLM backstop ran, its raw output, and the final
    #: source. Lets us SEE comprehension decisions live instead of guessing.
    debug: dict[str, Any] = field(default_factory=dict)


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


#: Résumé / cover-letter PARTS the user can jump to and highlight within the open
#: document (distinct from the app's top-level sections). Canonical ids line up with
#: ``document_map``'s section canons so the client can anchor the right block.
_DOC_SUBSECTIONS = {
    "summary": ("professional summary", "work summary", "summary", "objective", "profile",
                "about me"),
    "experience": ("work experience", "professional experience", "work history",
                   "employment history", "experience section", "experience", "employment"),
    "education": ("education section", "education", "schooling", "my degree", "degrees"),
    "skills": ("technical skills", "core skills", "key skills", "skills section", "skills"),
    "projects": ("projects section", "projects"),
    "certifications": ("certifications", "certificates", "licenses", "awards", "achievements"),
}
# Verbs that mean "take me there / put it in view" inside a document.
_FOCUS_VERB_RE = re.compile(
    r"\b(go to|take me to|jump to|scroll to|bring me to|show me|show|open|point (?:to|me to)|"
    r"read (?:me )?(?:the|my)|highlight|find|locate|where (?:is|does it say|are))\b")
# Verbs that specifically mean "mark/locate this text" (keyword highlight).
_HIGHLIGHT_VERB_RE = re.compile(
    r"\b(highlight|find|locate|point (?:to|out)|where (?:is|does it say|are))\b")


def _match_doc_subsection(text: str) -> Optional[str]:
    """The résumé/cover-letter part named, longest synonym first (so 'work experience'
    beats 'experience'). None if no part is named."""
    best, blen = None, 0
    for canon, syns in _DOC_SUBSECTIONS.items():
        for s in syns:
            if len(s) > blen and re.search(rf"\b{re.escape(s)}\b", text):
                best, blen = canon, len(s)
    return best


def _focus_document(t: str, context: dict) -> Optional[IntentResult]:
    """Jump to + highlight a SECTION ("go to Experience") or a WORD/PHRASE ("highlight
    leadership", "where does it say Education") within the open document → ``focus_document``
    (the client scrolls to and spotlights it; keyword highlight uses /documents/locate).
    Read-only navigation, never an edit. Returns None when it isn't a within-doc focus."""
    section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
    on_doc = any(w in section for w in ("document", "resume", "cover"))
    sub = _match_doc_subsection(t)
    # A section jump, not an edit: "rewrite/improve the summary" or "move my skills above
    # education" is an edit → let the edit path handle it (unless it's an explicit
    # highlight/find of the section).
    if sub and (_FOCUS_VERB_RE.search(t) or on_doc) and (
        _HIGHLIGHT_VERB_RE.search(t)
        or not (_EDIT_VERB_RE.search(t) or _DOC_IMPERATIVE_RE.search(t))
    ):
        slots: dict[str, Any] = {"section": "documents", "mode": "section",
                                 "target": sub, "highlight": True}
        dt = _doc_target(t)
        if dt:
            slots["doc"] = dt
        return IntentResult("focus_document", 0.88, slots)
    # Keyword / phrase highlight. An explicit "highlight …" is unambiguously about the
    # open document, so it parses anywhere; "find/where does it say …" needs document
    # context so it never steals a global/job search.
    if (on_doc or _DOC_CTX_RE.search(t) or re.search(r"\bhighlight\b", t)) and _HIGHLIGHT_VERB_RE.search(t):
        m = (re.search(r"\bhighlight\b(?:\s+(?:the|my))?\s+(?:word|phrase|line|part|mention of\s+)?\s*(.+)$", t)
             or re.search(r"\bwhere (?:does it say|is|are)\b\s+(.+)$", t)
             or re.search(r"\b(?:find|locate)\b(?:\s+the)?\s+(?:word|phrase|mention of)\s+(.+)$", t))
        if m:
            q = re.sub(
                r"\b(on|in)\s+(my\s+)?(resume|résumé|resumé|cv|cover\s*-?\s*letter|document)\b.*$",
                "", m.group(1)).strip(" ?.!'\"").strip()
            if q and len(q) >= 2:
                return IntentResult("focus_document", 0.85, {
                    "section": "documents", "mode": "text", "target": q, "highlight": True})
    return None


# "are these numbers still current?", "refresh the figures from the web", "find the latest
# metrics for this bullet" → a web-assisted refresh of a bullet's DATED figures (distinct
# from a user-supplied edit like "update it with the 2025 numbers").
_METRIC_WORD_RE = re.compile(
    r"\b(numbers?|figures?|metrics?|stats?|statistics|data|percentages?|growth|revenue|"
    r"earnings|results?)\b")
_STALE_Q_RE = re.compile(
    r"\b(current|accurate|up[- ]?to[- ]?date|updated|outdated|out of date|stale|old|"
    r"still (?:right|correct|true|accurate)|recent)\b")
_REFRESH_VERB_RE = re.compile(
    r"\b(refresh|update|re-?check|recheck|check|find|get|pull|look up|research|verify)\b")
_FROM_WEB_RE = re.compile(r"\b(latest|web|online|internet|current)\b")


def _refresh_metric(t: str, context: dict) -> Optional[IntentResult]:
    """Web-refresh a bullet's dated figures → ``refresh_metric`` (runs the metric-refresh
    flow: research → propose an updated bullet to review). Fires on a staleness question
    or an explicit "refresh/find the latest … from the web", scoped to the document."""
    if not _METRIC_WORD_RE.search(t):
        return None
    # "update it WITH the 2024/2025 numbers" supplies the data itself — that's an edit,
    # not a web-refresh; let _edit_document handle it.
    if re.search(r"\bwith\b", t):
        return None
    asking_stale = bool(re.search(r"\b(are|is|how old|still)\b", t)) and bool(_STALE_Q_RE.search(t))
    acting = bool(_REFRESH_VERB_RE.search(t)) and bool(_STALE_Q_RE.search(t) or _FROM_WEB_RE.search(t))
    if not (asking_stale or acting):
        return None
    section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
    on_doc = any(w in section for w in ("document", "resume", "cover"))
    # Scope to the document so a generic "find the latest news results" stays a web search:
    # on the doc page, an explicit this/these/bullet reference, or "the figures/numbers/…".
    anchored = (on_doc or _DOC_CTX_RE.search(t)
                or re.search(r"\b(bullet|line|this|these|it)\b", t)
                or re.search(r"\bthe (figures?|numbers?|metrics?|stats?|statistics|percentages?)\b", t))
    if not anchored:
        return None
    slots: dict[str, Any] = {}
    m = re.search(r"\b(?:bullet|line|item)\s*(\d+)\b", t)
    if m:
        slots["bullet"] = int(m.group(1))
    return IntentResult("refresh_metric", 0.86, slots)


# "review my summary", "is my summary up to date?", "what's wrong with my summary",
# "check my summary" → the summary-review flow (understand it, list weaknesses + fixes,
# freshness-check it). Distinct from "rewrite the summary" (an edit) and "go to the
# summary" (navigation).
_SUMMARY_NOUN_RE = re.compile(r"\b(summary|profile|objective|headline|opening line|intro)\b")
_REVIEW_VERB_RE = re.compile(
    r"\b(review|check|audit|critique|assess|evaluate|grade|look at|go over|whats? wrong with|"
    r"how(?:'?s| is| good is)|rate"
    # improvement questions are a review request too ("what should I fix", "what needs work")
    r"|what (?:should|do|can) i (?:fix|improve|change|work on|do better)"
    r"|what needs (?:work|fixing|improv\w*)|how (?:can|should|do) i improve"
    r"|what to (?:fix|improve)|needs? (?:work|fixing|improvement))\b")


def _review_summary(t: str, context: dict) -> Optional[IntentResult]:
    """Understand + critique + freshness-check the summary → ``review_summary``. Fires on a
    review/quality question or a staleness question aimed at the summary."""
    if not _SUMMARY_NOUN_RE.search(t):
        return None
    is_review = bool(_REVIEW_VERB_RE.search(t) or _STALE_Q_RE.search(t)
                     or re.search(r"\b(weak|weakness|improve the focus|out of sync|needs updating)\b", t))
    if not is_review:
        return None
    return IntentResult("review_summary", 0.88, {})


# "review my résumé", "go through my whole résumé", "walk my résumé section by section",
# "check my whole résumé" → a WHOLE-document review (header, summary, every role, education,
# skills) that offers to read the findings and walks each section. Distinct from
# review_summary (summary only) and from a bare edit.
_RESUME_NOUN_RE = re.compile(r"\b(resume|résumé|resumé|cv|cover\s*-?\s*letter|document)\b")
_WHOLE_RE = re.compile(r"\b(whole|entire|everything|all of it|section by section|top to bottom)\b")


def _review_document(t: str, context: dict) -> Optional[IntentResult]:
    """Walk the WHOLE résumé or cover letter → ``review_document``. Fires on a review/
    go-through request aimed at the document (not just the summary); ``doc`` says which."""
    if _SUMMARY_NOUN_RE.search(t):
        return None  # a summary-specific request belongs to _review_summary
    if not (_RESUME_NOUN_RE.search(t) or _WHOLE_RE.search(t)):
        return None
    is_review = bool(_REVIEW_VERB_RE.search(t)
                     or re.search(r"\b(go through|walk|run through)\b", t)
                     or _WHOLE_RE.search(t))
    if not is_review:
        return None
    named = _match_section(t)
    if named not in (None, "documents"):
        return None  # "review my matches/jobs" isn't a document review
    slots: dict[str, Any] = {}
    dt = _doc_target(t)
    if dt:
        slots["doc"] = dt  # "review my cover letter" → doc=cover_letter
    return IntentResult("review_document", 0.86, slots)


# A human expert the user might want to reach — recruiter, hiring manager, HR pro, coach.
_EXPERT_RE = re.compile(
    r"\b(recruiters?|hiring managers?|headhunters?|hr (?:pro|professional|rep|person|expert|team)|"
    r"human resources|career coach(?:es)?|resume (?:expert|pro|professional|reviewer)|industry expert|"
    r"an? expert|professional (?:advice|feedback|opinion|review)|talent (?:acquisition|advisor)|"
    r"hiring (?:expert|professional))\b")
# A cue that the user wants to be CONNECTED to / get advice from that expert.
_EXPERT_CONTACT_RE = re.compile(
    r"\b(talk to|speak (?:to|with)|chat with|connect (?:me )?with|put me in (?:front|touch)|"
    r"get (?:in touch|advice|feedback|help|a (?:human|professional|second) opinion)|contact|"
    r"reach out to|introduce me|have .*(?:review|look at)|run .* by|ask)\b")


def _connect_expert(t: str) -> Optional[IntentResult]:
    """Reach a human expert — recruiter, hiring manager, HR pro — for advice or content.
    A FUTURE feature (external partners); for now the assistant says it's coming soon."""
    if not _EXPERT_RE.search(t):
        return None
    if not (_EXPERT_CONTACT_RE.search(t)
            or re.search(r"\b(advice|feedback|opinion|review|guidance|insight|perspective)\b", t)):
        return None
    return IntentResult("connect_expert", 0.85)


# "how do I get more matches" / "not enough matches" / "get better matches" → guidance.
# Keyed on the match feature; the fuzzier "more jobs/roles" phrasings are left to the LLM.
_MORE_MATCHES_RE = re.compile(
    r"\b(?:more|better|additional|extra|fresh)\s+(?:job\s+)?matches\b"
    r"|\b(?:not enough|too few|so few|only a few|hardly any|barely any|need more)\s+(?:job\s+)?matches\b"
    r"|\bnot\b[^.?!]*\benough\b[^.?!]*\bmatches\b"
    r"|\bmatches\b[^.?!]*\b(?:not enough|too few|so few|only a few|hardly any)\b"
    r"|\bhow (?:do i|can i|to)\b[^.?!]*\b(?:get|find|see|have)\b[^.?!]*\bmore\b[^.?!]*\bmatches\b"
    r"|\b(?:increase|expand|grow|boost|improve|widen|broaden)\b[^.?!]*\bmatches\b"
    r"|\bwhy\b[^.?!]*\b(?:so few|only|few|no|not many)\b[^.?!]*\bmatches\b"
    # generic "more jobs/roles" GUIDANCE questions (a question, not an imperative search):
    # "how do I get more jobs", "how can I find more roles", "more jobs coming in".
    r"|\bhow (?:do i|to|can i)\b[^.?!]*\b(?:get|find|see|have|bring)\b[^.?!]*\bmore\b"
    r"[^.?!]*\b(?:jobs?|roles?|opportunities|positions?|postings?)\b"
    r"|\bmore\s+(?:jobs?|roles?|opportunities|postings?|listings?)\s+coming\s+in\b"
)

#: Spoken guidance for "how do I get more matches" — the real levers, not a web search.
_MORE_MATCHES_REPLY = (
    "A couple of ways to get more matches. First, broaden your search — refresh your matches "
    "or start a new search with wider titles, locations, or salary. The bigger lever is "
    "connecting more sources so more roles flow in: your email mailboxes and external job "
    "sites on the Connect page. If you don't have accounts on those job sites yet, setting "
    "them up and connecting them pulls in far more postings to match against."
)
#: Next step offered: open the sources page so they can connect more mailboxes / job sites.
_MORE_MATCHES_OFFER = {
    "prompt": "Want me to open your job sources so you can connect more?",
    "on_yes": {"intent": "navigate", "slots": {"section": "connect"}},
    "yes": "Open sources", "no": "Not now",
}


def _more_matches(t: str) -> Optional[IntentResult]:
    """Guidance for getting more/better matches — broaden the search AND connect more
    sources (mailboxes + external job sites, including creating accounts on them). Returns
    a spoken answer + an offer to open the sources page, not a web search."""
    if not _MORE_MATCHES_RE.search(t):
        return None
    return IntentResult("more_matches", 0.9, {}, reply=_MORE_MATCHES_REPLY,
                        offer=dict(_MORE_MATCHES_OFFER))


# "what would make my résumé/skillset stronger", "what certifications should I get", "what do
# I need to become a X" → forward-looking GROWTH advice (skills/certs/education/career), as
# distinct from review_document (fixing the writing of the existing résumé).
_STRENGTHEN_RE = re.compile(
    # certifications/credentials ONLY with an advice cue (not "learn about the PMP cert",
    # which is a web search).
    r"\b(?:what|which|should i|do i need)\b[^.?!]*\b(?:certifications?|certs?|certificate|credentials?|licen[sc]e)\b"
    r"|\b(?:certifications?|certs?|certificate|credentials?|licen[sc]e)\b[^.?!]*\b(?:should i (?:get|earn|"
    r"pursue|have)|do i need|worth (?:getting|earning|it)|recommend|would help|to get|to earn)\b"
    r"|\b(?:what|which)\b[^.?!]*\b(?:skills?|skill ?set|courses?|degree|education|training|"
    r"qualifications?)\b[^.?!]*\b(?:need|should|do i|to get|to learn|to have|required|help)\b"
    r"|\b(?:skills? gap|upskill|up-skill|reskill|re-skill)\b"
    r"|\bdo i (?:need|require)\b[^.?!]*\b(?:degree|certifications?|certificate|credentials?|"
    r"licen[sc]e|education|training|courses?|masters?|mba|bachelors?|bootcamp)\b"
    r"|\b(?:stronger|better|more competitive|stand ?out|more marketable)\b[^.?!]*"
    r"\b(?:candidate|applicant|profile|skillset|skill ?set)\b"
    r"|\b(?:make|making|become|be)\b[^.?!]*\b(?:a )?(?:stronger|more competitive|more marketable)\b"
    r"[^.?!]*\b(?:candidate|applicant|profile)\b"
    r"|\bhow (?:do|can|would) i (?:become|get into|break into|transition (?:in)?to|move into|"
    r"qualify for|be qualified)\b"
    r"|\bwhat (?:does it take|do i need|would it take)\b[^.?!]*\b(?:to (?:be|become|get|land|qualify|reach))\b"
    r"|\b(?:advance|grow|further|progress) my career\b|\bnext step in my career\b|\bcareer goal\b"
    r"|\b(?:what|which)\b[^.?!]*\b(?:make|makes)\b[^.?!]*\b(?:resume|r\xe9sum\xe9|skillset|skill ?set)\b"
    r"[^.?!]*\bstronger\b"
    r"|\bhow (?:do|can|would) (?:i|you)\b[^.?!]*\b(?:make|get)\b[^.?!]*\b(?:resume|r\xe9sum\xe9|"
    r"skillset|skill ?set|profile|candidacy)\b[^.?!]*\b(?:stronger|more competitive|more marketable)\b"
)
#: Role/goal target cues — extract what the advice should aim at, when stated.
_STRENGTHEN_TARGET_RE = re.compile(
    r"\b(?:to (?:be|become)|become|get into|break into|move into|transition (?:in)?to|"
    r"qualify for|for|as)\s+(?:a|an|the)?\s*([a-z][\w /&+-]*?)(?:\s+(?:role|job|position))?\s*[.?!]?$",
    re.I,
)


def _strengthen_resume(t: str) -> Optional[IntentResult]:
    """Advise what would make the résumé + skillset stronger (skills, certifications,
    education, experience, positioning) — in general, or for a role/goal named in the
    request. The frontend calls POST /resumes/{id}/strengthen with any role/goal slot."""
    if not _STRENGTHEN_RE.search(t):
        return None
    slots: dict[str, Any] = {}
    m = _STRENGTHEN_TARGET_RE.search(t)
    if m:
        tgt = re.sub(r"^(?:a|an|the)\s+", "", m.group(1).strip(), flags=re.I).strip()
        # keep it short + skip filler so "to be a stronger candidate" doesn't become a role
        if 2 <= len(tgt) <= 40 and tgt not in (
                "stronger", "better", "more", "qualified", "competitive", "marketable"):
            slots["role"] = tgt
    return IntentResult("strengthen_resume", 0.9, slots)


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
# Questions about PRIOR results ("what did you find for me", "anything you turned up?") are
# status/what's-new, not a request to run a new job search. Kept narrow (past/perfective
# "did you"/"have you"/"what did you") so a genuine "what jobs can you find" still searches.
_RESULT_QUESTION_RE = re.compile(
    r"\b(?:did you (?:find|get|turn up|dig up|do|come up with)"
    r"|what did you (?:find|get|do|turn up|come up with)"
    r"|what(?:'ve| have) you (?:found|got|done|turned up)"
    r"|anything (?:you )?(?:found|turned up|for me)"
    r"|find me anything)\b"
)
# Leading transport/filler verbs that introduce a search but aren't part of the query.
_LEAD_SEARCH_FILLER_RE = re.compile(
    r"^(?:pull up|bring up|show me|get me|find me|look for|look up|pull|bring|gimme|give me|fetch)\s+"
)
# A trailing geographic qualifier → the location slot. Geo prepositions ONLY ("near",
# "around", "close to", "within N miles of") — deliberately NOT "in", which also names a
# field ("in product management"), so we don't mistake a discipline for a place.
_LOCATION_RE = re.compile(
    r"\s*\b(?:near|around|close to|nearby in|within(?:\s+\d+\s*(?:miles?|mi|km))?\s+of)\s+([a-z][\w .,'-]*?)\s*$"
)
# Vague placeholders in a search object ("find me something", "any role") carry no query.
_SEARCH_PLACEHOLDER_RE = re.compile(r"\b(?:something|anything|some stuff|stuff|any (?:job|role|gig|position)s?)\b")
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
    r"|\bthis match\b|\btop (?:match|job|company|employer)\b|\bthem\b|\bit up\b"
    r"|\bthis (?:role|job)'?s (?:company|employer)\b"
)
_COMPANY_WORD_RE = re.compile(r"\b(compan(?:y|ies)|employer|headquarter|stock|reviews?|ceo|leadership)\b")

# Strip a leading role-lookup lead-in ("who is the CEO of <X>", "the founder of <X>")
# so the research target is the COMPANY, not "ceo of <X>".
_COMPANY_LEAD_RE = re.compile(
    r"^(?:who (?:is|are)\s+)?(?:the\s+)?"
    r"(?:ceo|cfo|coo|cto|founder|founders|owner|owners|head|boss|president|leadership|"
    r"management|exec(?:utive)?s?)\s+(?:of|at|for)\s+",
    re.I,
)
# Strip a trailing descriptor ("… as an employer", "… the company", a dangling "as")
# without eating a real suffix like "Ford Motor Company" (needs an explicit "the").
_COMPANY_TRAIL_RE = re.compile(
    r"\s+as\s+(?:an?\s+)?(?:employer|company|business|startup|firm|organization|org|"
    r"place(?:\s+to\s+work)?)\s*$"
    r"|\s+the\s+(?:company|employer|business|firm)\s*$"
    r"|\s+as\s*$",
    re.I,
)


def _clean_company_name(name: str) -> str:
    """Reduce an extracted span to the bare company: drop a role lead-in, a trailing
    'as an employer' / 'the company' descriptor, a dangling connective, and articles."""
    n = (name or "").strip(" ?.!,-")
    n = _COMPANY_LEAD_RE.sub("", n)
    prev = None
    while prev != n:  # trailing descriptors can stack ("… as a company the employer")
        prev = n
        n = _COMPANY_TRAIL_RE.sub("", n).strip(" ?.!,-")
    n = re.sub(r"^(?:the|a|an)\s+", "", n, flags=re.I).strip()
    n = re.sub(r"\s+(?:as|at|for|of)\s*$", "", n, flags=re.I).strip()
    return n


# A reference to the current company rather than a named one: "this company", "it",
# "the top match". After cleaning, such a span has no real name left.
_COMPANY_REF_WORDS_RE = re.compile(
    r"\b(this|that|these|those|the|a|an|compan(?:y|ies)|employer|place|one|job|role|"
    r"match|top|it|them|here)\b",
    re.I,
)


# --- document content edit (one prompt handles edits too) ---------------------
# "update this bullet with the 2025 numbers", "rewrite the summary", "improve bullet 2".
# A content edit on the current document/bullet; needs_web when it references current /
# external data so the one prompt can web-search first, then apply.
_EDIT_VERB_RE = re.compile(
    r"\b(update|revise|rewrite|re-?word|rephrase|improve|strengthen|punch up|polish|"
    r"refresh|expand|shorten|tighten|add to|change)\b"
    r"|\bmake\b(?=.{0,30}\b(?:better|stronger|current|recent|up[- ]?to[- ]?date|concise|"
    r"shorter|longer|clearer|punchier|professional)\b)")
_EDIT_DOCWORD_RE = re.compile(
    r"\b(bullet|line|item|summary|headline|paragraph|section|resume|résumé|resumé|cv|cover\s*letter|document)\b")
_FRESH_RE = re.compile(
    r"\b(current|latest|recent|up[- ]?to[- ]?date|updated|20\d\d|this year|last year|"
    r"metrics|numbers|figures|stats|statistics|performance|data|results|earnings|revenue)\b")


def _edit_document(t: str, context: dict) -> Optional[IntentResult]:
    """A content edit on the current document/bullet → ``edit_document`` (frontend runs
    Ask-AI). Sets ``needs_web`` when the edit references current/external data, so the one
    prompt can search the web first, then apply. Returns None when it isn't a doc edit."""
    if not _EDIT_VERB_RE.search(t):
        return None
    # An edit aimed at another section (matches/jobs/dashboard) isn't a document edit —
    # e.g. "update my matches" is a refresh, not an Ask-AI edit.
    named = _match_section(t)
    if named not in (None, "documents"):
        return None
    section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
    on_doc = any(w in section for w in ("document", "resume", "cover"))
    if not (on_doc or _EDIT_DOCWORD_RE.search(t)):
        return None
    # Require some SPECIFICITY so a bare "update my résumé" stays a refresh, not an edit:
    # a content target, a rewrite-style verb, a freshness cue, or a "with/to …" clause.
    has_target = bool(re.search(r"\b(bullet|line|item|summary|headline|paragraph|section)\b", t))
    has_rewrite = bool(re.search(
        r"\b(rewrite|re-?word|rephrase|improve|strengthen|punch up|polish|tighten|shorten|expand)\b", t
    )) or bool(_EDIT_VERB_RE.search(t) and re.search(r"\bmake\b", t))
    has_clause = bool(re.search(r"\b(with|to|about|into|so that|using)\b", t))
    if not (has_target or has_rewrite or _FRESH_RE.search(t) or has_clause):
        return None
    slots: dict[str, Any] = {}
    m = re.search(r"\b(?:bullet|line|item)\s*(\d+)\b", t)
    if m:
        slots["bullet"] = int(m.group(1))
    if _FRESH_RE.search(t):
        slots["needs_web"] = True  # search the web for the fresh facts, then apply the edit
    return IntentResult("edit_document", 0.8, slots)


# --- general open-web search --------------------------------------------------
# Common ways a user asks for a WEB search (not a job search, not a company lookup):
# "search the web/internet/online for …", "google …", "look … up online / on the web",
# "find information/articles/news about …", "what's the latest on …", "search online for …".
_WEBSEARCH_RE = re.compile(
    r"\bsearch (?:the )?(?:web|internet|online)\b|\bgoogle\b|\bbing\b|"
    r"\bsearch online\b|\blook online\b|\bon the (?:web|internet)\b|\bon google\b|"
    r"\blook .{0,12}up (?:online|on the web|on the internet)\b|"
    r"\bfind (?:me )?(?:information|info|articles?|news|results?) (?:about|on|for)\b|"
    r"\bwhat'?s? the latest(?: news)? (?:on|about)\b|\bsearch for .+ online\b",
    re.I,
)
# Phrases we strip to leave the bare query.
_WEBSEARCH_STRIP = re.compile(
    r"\b(can you|could you|please|hey|for me)\b|"
    r"\bsearch (?:the )?(?:web|internet|online)(?: for)?\b|\bsearch online(?: for)?\b|"
    r"\blook online for\b|\bgoogle\b|\bbing\b|\bon google\b|"
    r"\blook (?:it|that|them|this)? ?up(?: online| on the web| on the internet)?\b|"
    r"\bfind (?:me )?(?:information|info|articles?|news|results?)?(?: about| on| for)?\b|"
    r"\bwhat'?s? the latest(?: news)?(?: on| about)?\b|\bsearch for\b|"
    r"\b(?:on the )?(?:web|internet|online)\b",
    re.I,
)


def _web_search(t: str) -> Optional[IntentResult]:
    """A general open-web search request → ``web_search`` with the cleaned ``query``
    (``""`` = use the current topic/context, e.g. 'look that up on the web')."""
    if not _WEBSEARCH_RE.search(t):
        return None
    q = _WEBSEARCH_STRIP.sub(" ", t)
    q = re.sub(r"\s+", " ", q).strip(" ?.!,-")
    # Drop a dangling leading article/preposition left after stripping.
    q = re.sub(r"^(the|a|an|for|about|on|of)\s+", "", q).strip()
    return IntentResult("web_search", 0.88 if len(q) >= 2 else 0.8, {"query": q})


# Conversational info-seeking: "tell me about X", "what kind of X", "get more info on X",
# "learn more about X", "what do you know about X". A general topic → web_search; a
# company (by context or a company suffix) → research_company.
_INFO_TRIG_RE = re.compile(
    r"\btell me (?:more )?about\b|\bwhat kind(?:s)? of\b|\bwhat type(?:s)? of\b|"
    r"\b(?:get|give|grab|pull up) (?:me )?(?:some |more )?(?:info|information|details)\b|"
    r"\b(?:more|additional) (?:info|information|details)\b|\blearn (?:more )?about\b|"
    r"\bwhat do you know about\b|\bfill me in on\b|\bmore on\b",
    re.I,
)
_INFO_STRIP = re.compile(
    r"\btell me (?:more )?about\b|\bwhat kind(?:s)? of\b|\bwhat type(?:s)? of\b|"
    r"\b(?:get|give|grab|pull up) (?:me )?(?:some |more )?(?:info|information|details)(?: on| about| for)?\b|"
    r"\b(?:more|additional) (?:info|information|details)(?: on| about| for)?\b|"
    r"\blearn (?:more )?about\b|\bwhat do you know about\b|\bfill me in on\b|\bmore on\b|"
    r"\b(?:can you|could you|please|me)\b",
    re.I,
)
_COMPANY_INDICATOR_RE = re.compile(
    r"\b(inc|corp|corporation|llc|ltd|co|company|group|technologies|technology|systems|"
    r"solutions|labs?|holdings|industries|enterprises)\b",
    re.I,
)


def _info_search(t: str) -> Optional[IntentResult]:
    """Route conversational info-seeking ("tell me about / what kind of / get more info /
    learn about / what do you know about X") to a web search — or to company research when
    it's clearly about a company (context, or a company suffix). App content (a section or
    document) is left for the app handlers."""
    if not _INFO_TRIG_RE.search(t):
        return None
    q = _INFO_STRIP.sub(" ", t)
    q = re.sub(r"\s+", " ", q).strip(" ?.!,-")
    q = re.sub(r"^(the|a|an|on|about|of|more|some)\s+", "", q).strip()
    if len(q) < 2:
        return IntentResult("research_company", 0.8, {"company": ""})  # "tell me more about it"
    if _doc_target(q) or re.search(
        r"\bmy (?:match(?:es)?|jobs?|documents?|resumes?|dashboard|applications?|interviews?)\b", q
    ):
        return None  # "tell me about my matches/résumé" → app handlers, not a web search
    # Company research when it's about a company — by a company cue in the sentence, or a
    # company suffix in the span. Clean the span to the bare name; a pure reference
    # ("this company") cleans to nothing → resolve from context ("").
    name = _clean_company_name(q)
    # A role lead-in ("the founder/CEO of X") is itself a company cue.
    if _COMPANY_CTX_RE.search(t) or _COMPANY_INDICATOR_RE.search(q) or _COMPANY_LEAD_RE.search(q):
        if not _COMPANY_REF_WORDS_RE.sub(" ", name).strip():
            return IntentResult("research_company", 0.85, {"company": ""})
        return IntentResult("research_company", 0.85, {"company": name})
    return IntentResult("web_search", 0.84, {"query": q})


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
    # Clean the bare name first (drops "as an employer", a trailing "the company", a role
    # lead-in like "the CEO of …"), THEN drop stray fillers that may remain.
    residual = _clean_company_name(residual)
    residual = re.sub(r"\b(please|more|some|info|details)\b", " ", residual)
    residual = _clean_company_name(residual)
    residual = re.sub(r"\s+", " ", residual).strip()
    # A job search ("research VP jobs") or a doc/section is not company research.
    if _JOB_NOUN_RE.search(t) or _match_section(residual) or _doc_target(residual):
        return None
    if _COMPANY_WORD_RE.search(t) and not residual:
        return ""  # "look up the company" with no name → context
    return residual or None


# "is <X> legit / a real company", "find out if <X> is legitimate", "check whether <X> is
# a scam" — a trust check about an employer → company research, not a job search.
_LEGIT_RE = re.compile(
    r"\b(?:find out|check|see|verify|confirm|look into)\b[^.?!]*?\b(?:if|whether)\s+(.+?)\s+"
    r"is\s+(?:an?\s+)?(?:real|legit|legitimate|actual|genuine|trustworthy|a\s+scam|for\s+real)\b"
    r"|\bis\s+(.+?)\s+(?:an?\s+)?(?:real|legit|legitimate|actual|genuine|trustworthy)\s+"
    r"(?:company|employer|business|startup|firm|place)\b"
    r"|\bis\s+(.+?)\s+(?:legit|legitimate|a\s+scam|for\s+real)\b",
    re.I,
)


def _legitimacy_check(t: str) -> Optional[IntentResult]:
    """"is <X> a real company / legit", "find out if <X> is legitimate" → research the
    employer. Returns None when no company name is recoverable or it's really a job/doc ask."""
    m = _LEGIT_RE.search(t)
    if not m:
        return None
    name = _clean_company_name(next((g for g in m.groups() if g), ""))
    if not name or _JOB_NOUN_RE.search(name) or _match_section(name) or _doc_target(name):
        return None
    if not _COMPANY_REF_WORDS_RE.sub(" ", name).strip():
        return IntentResult("research_company", 0.8, {"company": ""})  # "is this place legit"
    return IntentResult("research_company", 0.85, {"company": name})


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


# A request about the FORMATTING of a résumé/cover-letter element — bullets, the header,
# the name/title/contact/email LINE, spacing, font — is a DOCUMENT EDIT, never email-account
# management. This guard keeps "remove the bullets from my header and the email address line"
# out of the connect-an-email flow.
_DOC_FORMAT_TARGET_RE = re.compile(
    r"\bbullet(?:\s*points?|s)?\b|\bheader\b|\bheading\b|\bname\s*(?:line|header)?\b|"
    r"\btitle\s*(?:line|header)?\b|\bcontact\s*(?:line|info|details)?\b|"
    r"\b(?:e-?mail(?:\s*address)?|phone|contact)\s*line\b")
# Formatting-ONLY verbs (remove a bullet marker, bold, align …) — NOT content verbs like
# "update/rewrite", so "update this bullet with the 2025 numbers" stays a content edit.
_DOC_FORMAT_VERB_RE = re.compile(
    r"\b(remove|strip|take\b.*\boff|delete|clear|drop|get rid of|un-?bullet|reformat|"
    r"re-?format|align|indent|outdent|bold|italic|underline|capitali[sz]e)\b")
# Pure-formatting targets — a plain "change/fix" on these is still a formatting edit.
_PURE_FORMAT_TARGET_RE = re.compile(
    r"\bformat(?:ting)?\b|\bindent\w*|\bspacing\b|\bfont\b|\bbold\b|\bitalic\b|\bunderline\b|"
    r"\balignment\b|\bmargins?\b")
_PURE_FORMAT_VERB_RE = re.compile(r"\b(change|fix|set|make|adjust)\b")
# Any imperative a user might aim at their document — the documents safety net routes these
# to an AI edit rather than requiring an exact scripted phrase.
_DOC_IMPERATIVE_RE = re.compile(
    r"\b(remove|delete|strip|take\b.*\b(?:off|out|away)|get rid of|add|put|change|make|fix|"
    r"update|rewrite|re-?word|"
    r"rephrase|reorder|move|swap|replace|shorten|lengthen|expand|condense|combine|split|"
    r"merge|bold|italic|italici[sz]e|underline|capitali[sz]e|lower-?case|upper-?case|indent|"
    r"outdent|align|format|re-?format|clean up|tidy|correct|adjust|convert|drop|cut|trim|"
    r"insert|append|prepend|emphasi[sz]e|rename|reposition|number|bulletize|un-?bullet)\b")


def _doc_format_edit(t: str, context: dict) -> Optional[IntentResult]:
    """A formatting edit on a résumé/cover-letter element ("remove the bullets from my header
    and the email address line", "strip the bullets off my name and title", "change the font")
    → open the document for the edit. Checked BEFORE email-account management so a header/
    bullet/email-LINE formatting change is never mistaken for connecting an email account.
    Only FORMATTING verbs count here — a content edit ("update this bullet with …") is left
    to :func:`_edit_document`."""
    is_format = (
        bool(_DOC_FORMAT_TARGET_RE.search(t) and _DOC_FORMAT_VERB_RE.search(t))
        or bool(_PURE_FORMAT_TARGET_RE.search(t) and _PURE_FORMAT_VERB_RE.search(t))
    )
    if not is_format:
        return None
    # Only bail for a STRONG non-document target. An incidental "email" word resolves
    # _match_section to "inbox", but "remove the bullets from … the email line" is still a
    # résumé formatting edit — don't let that stray word send it to the inbox/connect flow.
    if _match_section(t) in ("matches", "dashboard", "interview", "auto_apply", "applications"):
        return None  # "remove this from my matches" etc. isn't a document edit
    section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
    doc = _doc_target(t) or ("cover_letter" if "cover" in section else "resume")
    return IntentResult("navigate", 0.85,
                        {"section": "documents", "doc": doc, "edit": t})


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


# --- archive / unarchive a document or email ----------------------------------
# "archive this résumé", "unarchive my email", "restore my cover letter" → a reversible
# archive action. Checked EARLY so the fuzzy playbook matcher doesn't mis-read
# "unarchive my email" as "connect my email".
_ARCHIVE_RE = re.compile(r"\b(archive|unarchive|un-archive|restore|bring back|put back|undo archive)\b")
_UNARCHIVE_RE = re.compile(r"\b(unarchive|un-archive|restore|bring back|put back|undo archive)\b")


def _archive_action(t: str) -> Optional[IntentResult]:
    """Map an archive/unarchive request to the ``archive`` intent with ``action``
    (archive|unarchive) and the target (``doc_type`` for a document, or ``target:email``
    for an inbox message), else None."""
    if not _ARCHIVE_RE.search(t):
        return None
    slots: dict[str, Any] = {"action": "unarchive" if _UNARCHIVE_RE.search(t) else "archive"}
    dt = _doc_target(t)
    if dt:
        slots["doc_type"] = dt
    if re.search(r"\b(e-?mail|message|inbox|mail)\b", t):
        slots["target"] = "email"
    return IntentResult("archive", 0.9, slots)


# --- keep documents current on external job sites -----------------------------
# "update my résumé on the job sites", "sync my resume to LinkedIn", "is my resume up to
# date on Indeed" → manage the board copies of a document (map/push/verify).
_BOARD_NAMES = {
    "linkedin": ("linkedin",), "indeed": ("indeed",), "glassdoor": ("glassdoor",),
    "ziprecruiter": ("ziprecruiter", "zip recruiter"), "dice": ("dice",), "monster": ("monster",),
}
_SYNC_VERB_RE = re.compile(
    r"\b(sync|re-?sync|update|push|upload|re-?upload|keep .{0,20}current|make .{0,20}current)\b")
_SYNC_TARGET_RE = re.compile(
    r"\b(job ?sites?|job ?boards?|boards?|profiles?|everywhere|all (?:the )?sites|"
    r"linkedin|indeed|glassdoor|zip ?recruiter|dice|monster)\b")
_SYNC_CURRENT_RE = re.compile(r"\b(up to date|current|in sync|synced|latest|stale|out of date|outdated)\b")


def _sync_documents(t: str) -> Optional[IntentResult]:
    """Recognize a request to keep a résumé / cover letter current on external job sites
    (map / push / verify). Returns ``sync_documents`` with optional ``doc_type`` and
    ``board``, else None."""
    has_doc = bool(_doc_target(t)) or bool(re.search(r"\b(documents?|cv)\b", t))
    if not has_doc:
        return None
    board = next((k for k, syns in _BOARD_NAMES.items() if any(s in t for s in syns)), None)
    verb = bool(_SYNC_VERB_RE.search(t))
    target = bool(_SYNC_TARGET_RE.search(t))
    is_question = bool(re.search(r"\b(is|are|whats|check|are my|is my)\b", t) and _SYNC_CURRENT_RE.search(t))
    if (verb and (target or board)) or (is_question and (board or target)):
        slots: dict[str, Any] = {}
        dt = _doc_target(t)
        if dt:
            slots["doc_type"] = dt
        if board:
            slots["board"] = board
        return IntentResult("sync_documents", 0.85, slots)
    return None


def _extract_search_query(t: str) -> Optional[dict]:
    """If ``t`` is a job-search request, return ``{"query": ..., "location"?: ...}``, else None.

    Recognizes a search verb ("find/search/list …"), a filter clause ("jobs that are …"),
    or a keyword+job-noun phrase ("VP roles"). Strips leading transport verbs ("pull up …")
    and a trailing location ("near Charlotte") so the query is the actual target, not the
    wrapper words. Defers to playbooks and to document/section navigation so "which jobs
    fit" (a playbook) and "find my résumé" (nav) aren't hijacked, and to result-questions
    ("what did you find for me") which are status, not a new search."""
    if _RESULT_QUESTION_RE.search(t):
        return None
    if not (_SEARCH_VERB_RE.search(t) or _SEARCH_CLAUSE_RE.search(t) or _JOB_NOUN_RE.search(t)):
        return None
    # A concrete playbook phrase ("which jobs fit", "rate my jobs") wins over search.
    if _match_playbook(t):
        return None

    work = _LEAD_SEARCH_FILLER_RE.sub("", t).strip()
    location = None
    mloc = _LOCATION_RE.search(work)
    if mloc:
        location = mloc.group(1).strip(" .,").title()
        work = work[:mloc.start()].strip()
    # Drop placeholders ("something") and a now-dangling preposition ("in product management").
    work = _SEARCH_PLACEHOLDER_RE.sub(" ", work)
    work = re.sub(r"^(?:in|for|within|around|at|of)\b\s*", "", work).strip()
    work = re.sub(r"\b(?:in|for|within|around|at|of)\b\s*$", "", work).strip()

    from jobsearch.engines.sourcing.job_query import parse_alternatives

    alts = parse_alternatives(work or t)
    query = " or ".join(alts).strip()
    if len(query) < 2:
        # Bare "roles near Charlotte" with no descriptive term still searches that location.
        if location:
            query = "jobs"
        else:
            return None
    # If what's left is really a section/document ("find my résumé", "show matches"),
    # let the navigation matcher handle it instead of searching for that word — unless a
    # location qualifier made it unambiguously a search ("roles near Charlotte", where the
    # bare noun "roles" also happens to be a synonym for the matches section).
    if not location and (_match_section(query) or _doc_target(query)):
        return None
    out = {"query": query}
    if location:
        out["location"] = location
    return out


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
    # "read ..." that references bullets/lines in any natural phrasing — "read my bullets",
    # "read my bullet points", "read my résumé bullets", "read out my bullets", "read the
    # lines", "read them/these", "read the suggestions". Narrow exact-phrase matching sent
    # variations ("read my bullet points") to the low-confidence fallback, where they could
    # be mis-routed (e.g. navigate elsewhere) instead of reading the bullets.
    if (has("read them", "read these", "read the suggestions")
            or re.search(r"\bread\b(?:\s+\w+){0,4}?\s+(?:bullets?|bullet\s*points?|lines?)\b", t)):
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

    # archive / unarchive a document or email ("unarchive my email", "restore my cover
    # letter") — checked before the fuzzy matchers so it isn't mis-read as a playbook.
    av = _archive_action(t)
    if av is not None:
        return av

    # keep a document current on external job sites ("update my résumé on LinkedIn",
    # "sync my resume to the job boards", "is my résumé up to date on Indeed") — checked
    # before manage/navigate/refresh so "update my resume on linkedin" isn't a refresh.
    sd = _sync_documents(t)
    if sd is not None:
        return sd

    # a FORMATTING edit on a résumé element ("remove the bullets from my header and the
    # email address line", "strip the bullets off my name and title") — a document edit.
    # Checked before _manage_action so an email/header formatting change is never mistaken
    # for connecting or removing an email account.
    dfe = _doc_format_edit(t, context)
    if dfe is not None:
        return dfe

    # manage a resource ("connect a new email account", "add an email source",
    # "disconnect my inbox", "replace the email on my résumé") — an explicit
    # connect/add/remove/change verb + an object. Checked before research/search/navigate
    # so the user's intent to USE the app's basic services is honored by voice or text.
    ma = _manage_action(t, context)
    if ma is not None:
        return ma

    # reach a human expert — recruiter / hiring manager / HR pro — for advice or content
    # ("put me in front of a recruiter", "have an expert review my résumé"). A FUTURE
    # feature; checked before document-review/playbooks so "have an expert review …" routes
    # to the coming-soon acknowledgement, not an in-app review.
    ce = _connect_expert(t)
    if ce is not None:
        return ce

    # forward-looking GROWTH advice ("what certifications should I get", "what skills do I
    # need to become a data scientist", "how do I make my skillset stronger"). Checked
    # before review_document/edit so a "how do I get stronger" is skills/certs/education
    # advice, not a writing-fix review.
    st = _strengthen_resume(t)
    if st is not None:
        return st

    # understand + freshness-check the SUMMARY ("review my summary", "is my summary up to
    # date?", "what's wrong with my summary") — the summary-review flow. Before focus/edit
    # so it isn't read as "go to the summary" or a bare rewrite.
    rs = _review_summary(t, context)
    if rs is not None:
        return rs

    # walk the WHOLE résumé ("review my résumé", "go through my whole résumé section by
    # section") — the full document review. After the summary check so a summary-specific
    # request stays summary-only.
    rd = _review_document(t, context)
    if rd is not None:
        return rd

    # web-refresh a bullet's DATED figures ("are these numbers still current?", "refresh
    # the figures from the web", "find the latest metrics for this bullet") — the
    # metric-refresh flow (research → propose). Checked before _edit_document so a
    # staleness/refresh request runs the research flow, not a bare Ask-AI edit.
    rm = _refresh_metric(t, context)
    if rm is not None:
        return rm

    # jump to + highlight a SECTION or WORD inside the open document ("go to Experience",
    # "highlight leadership", "where does it say Education"). Before _edit_document/web so a
    # within-doc focus isn't read as an edit or a global search.
    fd = _focus_document(t, context)
    if fd is not None:
        return fd

    # document content edit ("update this bullet with the 2025 numbers", "rewrite the
    # summary") — the one prompt handles edits; needs_web triggers a web search first.
    ed = _edit_document(t, context)
    if ed is not None:
        return ed

    # "how do I get more matches" / "not enough matches" → in-app guidance (broaden the
    # search AND connect more sources), not a web search or a job search. Checked before
    # web/search/playbooks so it isn't read as a lookup or a "rate my matches" walk.
    mm = _more_matches(t)
    if mm is not None:
        return mm

    # general open-web search ("search the web for …", "google …", "find information
    # about …", "what's the latest on …") — a web lookup, not a job search or company
    # lookup. Checked before research_company/search_jobs so the explicit web cue wins.
    ws = _web_search(t)
    if ws is not None:
        return ws

    # conversational info-seeking ("tell me about the CISSP exam", "what kind of …",
    # "get more info on …") → a web search, or company research when it's a company.
    info = _info_search(t)
    if info is not None:
        return info

    # research a company ("tell me about Acme", "look up this company", "research the top
    # match") — distinct from a job search. company="" means resolve from context (the
    # focused / top-matched company). Checked before job-search and navigate.
    rc = _research_company(t)
    if rc is not None:
        return IntentResult("research_company", 0.85, {"company": rc})

    # trust check about an employer ("is Acme legit", "find out if Rylo is a real company")
    # → company research, not a job search. Checked before search_jobs so "find out …" and
    # "is …" phrasings don't fall through to the job-search verb matcher.
    legit = _legitimacy_check(t)
    if legit is not None:
        return legit

    # job search ("find all jobs that are vice president or VP", "remote senior python
    # roles") — a free-text query with OR-alternatives + synonym expansion. Checked
    # before navigate so "find VP jobs" searches rather than just opening the jobs list,
    # but it defers to playbooks and to section/document nav (see _extract_search_query).
    sq = _extract_search_query(t)
    if sq:
        return IntentResult("search_jobs", 0.85, dict(sq))

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
                # The document renders ONLY in the editor — there is no separate
                # Documents-section preview. "show/open my résumé" lands in the editor,
                # the single surface where the document renders with the assistant's
                # full function set. Carry WHICH document the user named.
                slots["view"] = "editor"
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
           "since i was last", "since i was here", "while i was away", "what did i miss",
           "what did you find", "what have you found", "what did you get", "what did you turn up",
           "did you find anything", "anything for me"):
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

    # options / help — only when the request IS "what can I do / help", NOT when "help me"
    # merely prefixes a concrete request ("help me tighten my experience" → edit, not help).
    if (has("what can i do", "what can you do", "read my options", "what are my options",
            "show me my options", "what else can i do")
            or re.fullmatch(r"(help|help me|please help|i need help|options|the menu|menu|what now)", t)):
        return IntentResult("read_options", 0.85)

    # yes / no — last among short commands so specific verbs win first
    if re.fullmatch(
        r"(yes|yeah|yep|yup|ya|sure|ok|okay|okey|do it|go|go ahead|go for it|confirm|sounds good|"
        r"sounds great|please do|absolutely|definitely|of course|that works|correct|right|"
        r"lets do it|let s do it|lets go|do that|yes do it|yep do it|sure thing|perfect|"
        r"yes please|please|affirmative)",
        t,
    ) or has("do it", "go ahead", "sounds good", "yes please", "go for it", "lets do it",
             "do that", "sure thing"):
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

    # --- documents safety net ---------------------------------------------------
    # Last resort BEFORE giving up: on the document, an imperative we didn't match to a
    # specific nav/review/search command becomes an AI EDIT — the Ask-AI endpoint interprets
    # arbitrary phrasing and applies it (reversible via versions). This is why the user
    # shouldn't have to script every phrase: anything like "remove the bullets from my
    # header", "make the title bigger", "combine these two lines" becomes a document edit
    # instead of a wrong guess or a dead end.
    section = str((context or {}).get("section") or (context or {}).get("page") or "").lower()
    on_doc = any(w in section for w in ("document", "resume", "cover"))
    if (on_doc or _DOC_CTX_RE.search(t)) and _DOC_IMPERATIVE_RE.search(t):
        doc = _doc_target(t) or ("cover_letter" if "cover" in section else "resume")
        slots: dict[str, Any] = {"section": "documents", "doc": doc, "edit": t}
        if _FRESH_RE.search(t):
            slots["needs_web"] = True  # "current/latest …" → web-search first, then apply
        return IntentResult("navigate", 0.7, slots)

    return IntentResult("unknown", 0.0)


# ---- optional LLM backstop -------------------------------------------------
# The deterministic matcher can only recognize phrasings someone anticipated. The
# backstop is what makes the assistant understand PLAIN LANGUAGE — casual, indirect,
# or novel wording that maps cleanly to something the app can do. It must therefore be
# a real classifier (intent menu with descriptions + worked examples + slot extraction
# + tolerant parsing), not a bare "pick from this list" call.

_LLM_SYSTEM = (
    "You are the intent router for a job-search web app's voice/text assistant. "
    "Map the user's utterance to EXACTLY ONE intent id from the menu and extract slots. "
    "When the request IS about this user's job search, résumé, applications, or using this "
    "app, pick the closest ACTIONABLE intent even if the wording is casual, indirect, or "
    "paraphrased — users rarely say the 'official' phrasing. "
    "But output 'ask' (do NOT force an app action) when the utterance is general knowledge, "
    "trivia, world facts, math, news, or anything NOT about this user's job search / résumé "
    "/ this app — it will be offered as a web search instead. A wrong app action is worse "
    "than abstaining. "
    "Reply with ONLY one compact JSON object — no prose, no markdown, no code fence."
)

#: One-line meanings for the intents the model most needs to tell apart. Intents not
#: listed here are still valid outputs (the full id list is included in the prompt), but
#: these are the ones casual phrasing collides on.
_INTENT_HELP: dict[str, str] = {
    "navigate": "go to / open / take me to a page or section. slot section ∈ "
                "{matches, documents, applications, auto_apply, interview, inbox, connect, design, dashboard}.",
    "search_jobs": "find job postings by title/keyword/location. slots: query, location.",
    "research_company": "look into, vet, or check if a company/posting is legit/real. slot: query (company).",
    "focus_document": "jump to / spotlight / improve a part of the open résumé or cover letter, "
                      "or review one section. slots: section (summary|experience|education|skills|…), target.",
    "refresh_metric": "check whether the résumé's figures/stats/numbers are still current, "
                      "or update them from the web (e.g. 'these numbers look old', 'are these still accurate').",
    "review_summary": "review or freshness-check the résumé SUMMARY specifically.",
    "review_document": "review the WHOLE résumé / what should I fix / what needs work on it.",
    "connect_expert": "reach a HUMAN expert — recruiter, hiring manager, HR pro, career coach — "
                      "for advice, feedback, or content (a future 'coming soon' feature).",
    "read_bullets": "read the résumé's bullets/lines aloud (read-along), e.g. 'read the top of my résumé'.",
    "edit_document": "improve / reword / rewrite / fix the résumé or one line in it (e.g. 'I don't like this bullet').",
    "suggest_bullets": "turn work/experience/achievements into résumé bullet points.",
    "start_playbook": "run a guided multi-step flow. slot playbook ∈ "
                      "{walk_matches, tailor, apply_job, connect_source, auto_apply, practice, upload, download, design, bullets}.",
    "status_report": "summarize the current state / what's on this page right now.",
    "whats_new": "what changed / what did you find / what's new since last time.",
    "more_matches": "how to GET MORE / better / additional matches or jobs coming in "
                    "(broaden the search AND connect more sources — mailboxes, job sites). "
                    "NOT a web search; not rating existing matches.",
    "strengthen_resume": "advise what would make the résumé + SKILLSET stronger — skills to "
                        "build, CERTIFICATIONS to earn, EDUCATION/degrees/courses, experience "
                        "framing — in general or for a role/career goal. slots: role, goal. "
                        "(Forward-looking growth advice, NOT fixing the writing of the résumé.)",
    "save": "save / bookmark / keep the current item for later.",
    "archive": "archive / hide / dismiss an item.",
    "web_search": "search the web for general info the app itself doesn't hold.",
    "check_mic": "microphone isn't working / can't hear me.",
    "check_audio": "no sound / audio output troubleshooting.",
    "change_voice": "change the assistant's voice. slot: voice.",
    "set_rate": "change how FAST the assistant SPEAKS (talk slower/faster). NOT about editing text. slot: rate.",
    "what_can_i_do": "list what the assistant can do / help / options.",
}

#: Worked examples spanning the casual-phrasing failure modes the deterministic pass misses.
_LLM_FEWSHOT: list[tuple[str, str, dict]] = [
    ("my numbers look old, can you check them", "refresh_metric", {}),
    ("are these stats still accurate", "refresh_metric", {}),
    ("read the top of my resume to me", "read_bullets", {}),
    ("i don't like this bullet", "edit_document", {}),
    ("my experience section feels weak, help", "focus_document", {"section": "experience"}),
    ("help me tighten my work experience", "focus_document", {"section": "experience"}),
    ("can you spruce up my summary", "review_summary", {}),
    ("polish my resume", "edit_document", {}),
    ("talk slower", "set_rate", {"rate": "slower"}),
    ("take me somewhere i can apply automatically", "navigate", {"section": "auto_apply"}),
    ("pull up roles near Charlotte", "search_jobs", {"query": "roles", "location": "Charlotte"}),
    ("find me something in product management", "search_jobs", {"query": "product management"}),
    ("what did you find for me today", "whats_new", {}),
    ("how do i come across in interviews", "navigate", {"section": "interview"}),
    ("is this company for real", "research_company", {}),
    ("put me in front of a recruiter", "connect_expert", {}),
    ("can i talk to a hiring manager for advice", "connect_expert", {}),
    ("what should i fix on my resume", "review_document", {}),
    ("how do i get more matches", "more_matches", {}),
    ("i'm not getting enough job matches", "more_matches", {}),
    ("how do i get more jobs coming in", "more_matches", {}),
    ("what certifications should i get", "strengthen_resume", {}),
    ("what skills do i need to become a data scientist", "strengthen_resume", {"role": "data scientist"}),
    ("how can i make my skillset stronger", "strengthen_resume", {}),
    ("what would make me a stronger candidate for product management", "strengthen_resume", {"role": "product management"}),
    ("do i need a degree to become a software engineer", "strengthen_resume", {"role": "software engineer"}),
    ("what's the weather tomorrow", "ask", {}),
    ("what's the capital of Mongolia", "ask", {}),
    ("who won the game last night", "ask", {}),
    ("what's 15% of 200", "ask", {}),
]

#: Slot keys we accept back from the model (anything else is dropped).
_LLM_SLOT_KEYS = {"section", "playbook", "voice", "rate", "index", "query", "location", "target", "doc"}


def _coerce_intent(raw_intent: str) -> Optional[str]:
    """Map the model's returned intent id onto a real INTENTS member, tolerating case,
    spacing, hyphens, and near-misses (e.g. 'read bullets', 'refresh-metric')."""
    s = re.sub(r"[\s\-]+", "_", str(raw_intent or "").strip().lower())
    if s in INTENTS:
        return s
    # near-miss: a known id that contains, or is contained by, the returned token
    for i in INTENTS:
        if i == s or i in s or s in i:
            return i
    return None


def _llm_classify(text: str, context: dict, llm, debug: Optional[dict] = None) -> Optional[IntentResult]:
    """Classify *text* with the premium LLM. Returns a confident, actionable
    :class:`IntentResult`, or ``None`` when the model abstains ('ask'/'unknown'/unknown id)
    so the caller's web-search offer still applies. Never raises."""
    menu = "\n".join(f"- {k}: {v}" for k, v in _INTENT_HELP.items())
    others = sorted(INTENTS - set(_INTENT_HELP) - {"unknown"})
    examples = "\n".join(
        f'  {u!r} -> {{"intent":"{i}","slots":{json.dumps(sl)}}}' for u, i, sl in _LLM_FEWSHOT
    )
    page = str((context or {}).get("section") or (context or {}).get("page") or "").strip()
    on_doc = bool((context or {}).get("resume_id") or (context or {}).get("cover_letter_id")
                  or page in ("documents", "document"))
    prompt = (
        "Intent menu (pick ONE id):\n" + menu + "\n"
        "Other valid ids: " + ", ".join(others) + ".\n"
        "Slots you may return: section, playbook, voice, rate, index, query, location, target, doc. "
        "Use the exact section/playbook ids shown above.\n\n"
        "Examples:\n" + examples + "\n\n"
        f"Current page: {page or 'unknown'}"
        + (" (a résumé/cover letter is open)" if on_doc else "") + "\n"
        f"Utterance: {text!r}\n"
        'Return ONLY: {"intent":"<id>","confidence":0..1,"slots":{...}}'
    )
    try:
        raw = llm.complete(prompt, system=_LLM_SYSTEM, max_tokens=120, temperature=0.0)
    except Exception as e:  # noqa: BLE001 - never let the backstop raise
        if debug is not None:
            debug["llm_error"] = f"{type(e).__name__}: {e}"
        return None
    if debug is not None:
        debug["llm_raw"] = (raw or "")[:300]
    try:
        start, end = raw.find("{"), raw.rfind("}")
        data = json.loads(raw[start:end + 1]) if start != -1 and end != -1 else {}
    except Exception:  # noqa: BLE001
        m = re.search(r'"intent"\s*:\s*"([^"]+)"', raw or "")
        data = {"intent": m.group(1)} if m else {}
    intent = _coerce_intent(data.get("intent", ""))
    if debug is not None:
        debug["llm_intent"] = intent or f"(unmapped:{data.get('intent')!r})"
    # Abstention — let the deterministic ask/web-search path handle it.
    if intent in (None, "ask", "unknown"):
        return None
    slots = {k: v for k, v in (data.get("slots") or {}).items()
             if k in _LLM_SLOT_KEYS and isinstance(v, (str, int)) and str(v).strip()}
    # Validate referential slots against the real vocab; drop a bad guess rather than act on it.
    if slots.get("section") and str(slots["section"]).lower() not in _SECTIONS:
        slots.pop("section", None)
    if slots.get("playbook") and str(slots["playbook"]).lower() not in _PLAYBOOKS:
        slots.pop("playbook", None)
    try:
        conf = float(data.get("confidence", 0.8) or 0.8)
    except (TypeError, ValueError):
        conf = 0.8
    # A successful understanding should clear the threshold (so it's acted on, not offered
    # as a web search) while staying short of a hand-written deterministic match.
    return IntentResult(intent, max(0.72, min(conf, 0.95)), slots)


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
    ("Search the web for interview tips", ("*",)),
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
    ("Go to my experience section", ("documents",)),
    ("Highlight the word leadership", ("documents",)),
    ("Are these numbers still current?", ("documents",)),
    ("Refresh the figures from the web", ("documents",)),
    ("Review my summary", ("documents",)),
    ("Is my summary up to date?", ("documents",)),
    ("Review my whole résumé", ("documents",)),
    ("Go through my résumé section by section", ("documents",)),
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


def command_catalog() -> list[dict[str, Any]]:
    """Every example command the assistant understands (verified to parse), across ALL
    screens — a keyword/intent index the assistant can match and compare user phrasing
    against. Each item: {text, intent, slots, screens}."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for text, tags in _SUGGESTIONS:
        if text.lower() in seen:
            continue
        r = _verified(text, {})
        if r is None:
            continue
        seen.add(text.lower())
        out.append({"text": text, "intent": r.intent, "slots": dict(r.slots), "screens": list(tags)})
    return out


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


# ---- spoken replies ---------------------------------------------------------

#: Human labels for section slots, for narration ("Taking you to your matches.").
_SECTION_LABEL = {
    "matches": "your matches", "documents": "your documents", "auto_apply": "auto-apply",
    "design": "the design studio", "interview": "interview practice",
    "connect": "your connected sources", "inbox": "your inbox",
    "community": "the community", "dashboard": "your dashboard",
}
#: Human labels for playbook slots.
_PLAYBOOK_LABEL = {
    "connect_source": "connecting an email source", "auto_apply": "setting up auto-apply",
    "walk_matches": "walking through your matches", "apply_job": "applying to this job",
    "upload": "uploading a document", "download": "the download options",
    "design": "the design options", "tailor": "tailoring your document",
    "practice": "interview practice", "bullets": "the work-highlights workshop",
}
#: Human labels for report_state fields.
_FIELD_LEAD = {
    "version": "Let me check which version that is.",
    "score": "Let me pull up that score.",
    "matches": "Let me look at your matches.",
    "document": "Let me check that document.",
    "page": "",  # handled specially — say where they are
}


def _reply_for(result: "IntentResult", context: dict) -> str:
    """A short, natural spoken acknowledgement for the classified intent.

    The client routes every utterance through ``/interpret`` and speaks this; without
    it the assistant stays silent. For data-dependent intents this is a lead-in — the
    client still speaks the concrete value/list it fetches from the endpoint.
    """
    intent, slots = result.intent, result.slots or {}

    # If a branch already set a reply (e.g. the email disambiguation), keep it.
    if result.reply:
        return result.reply

    if intent == "navigate":
        sec = _SECTION_LABEL.get(str(slots.get("section", "")), "that section")
        return f"Refreshing {sec}." if slots.get("refresh") else f"Taking you to {sec}."
    if intent == "start_playbook":
        pb = _PLAYBOOK_LABEL.get(str(slots.get("playbook", "")), "that")
        return f"Okay — {pb}."
    if intent == "report_state":
        return _FIELD_LEAD.get(str(slots.get("field", "")), "Let me check that for you.")
    if intent == "connect_expert":
        return ("Getting you expert help is coming soon — I'll be able to connect you with "
                "recruiters, HR pros, and hiring managers for advice and content. It's not "
                "live yet, but it's on the way; I'll let you know when it's ready.")
    if intent == "more_matches":
        return _MORE_MATCHES_REPLY
    if intent == "strengthen_resume":
        tgt = str(slots.get("role") or slots.get("goal") or "").strip()
        aim = f" for {tgt}" if tgt else ""
        return (f"Let me look at what would make your résumé and skillset stronger{aim} — "
                "skills to build, certifications worth earning, and any education that would help.")
    if intent == "web_search":
        q = str(slots.get("query", "")).strip()
        return f"Searching the web for {q}." if q else "Let me search that for you."
    if intent == "research_company":
        c = str(slots.get("company", "")).strip()
        return f"Looking into {c}." if c else "Let me look into that company."
    if intent == "search_jobs":
        q = str(slots.get("query", "")).strip()
        loc = str(slots.get("location", "")).strip()
        where = f" near {loc}" if loc else ""
        if q and q.lower() not in ("jobs", "roles", "job", "role"):
            return f"Searching for {q} roles{where}."
        return f"Searching for roles{where}." if where else "Searching for matching roles."
    if intent == "edit_document":
        if slots.get("needs_web"):
            return "I'll look up the latest figures and update that for you."
        return "Updating that in your document."
    if intent == "sync_documents":
        return "Updating your document on your job sites."
    if intent == "archive":
        un = str(slots.get("action", "")) == "unarchive"
        return "Bringing that back from your archive." if un else "Archiving that for you."
    if intent == "save":
        return "Saving your changes."
    if intent == "decline":
        return "Okay, no problem."
    if intent == "confirm":
        return "Got it."  # a bare yes with nothing pending
    if intent == "stop":
        return "Stopping."
    if intent == "pause":
        return "Paused."
    if intent in ("continue", "next"):
        return "Okay, moving on."
    if intent == "back":
        return "Going back."
    if intent == "repeat":
        return ""  # the client re-speaks the prior line; no extra chatter
    if intent == "skip":
        return "Skipping that one."
    if intent == "cancel":
        return "Cancelled."
    if intent == "set_rate":
        d = slots.get("direction")
        if d == "faster":
            return "Speaking faster."
        if d == "slower":
            return "Speaking slower."
        return "Adjusting my speaking speed."
    if intent == "change_voice":
        return "Switching my voice."
    if intent == "check_mic":
        return "Checking your microphone."
    if intent == "check_audio":
        return "Checking the audio."
    if intent == "status_report":
        return "Here's where things stand."
    if intent == "whats_new":
        return "Here's what's new."
    if intent == "resume_task":
        return "Picking up where we left off."
    if intent == "read_options":
        return "Here are your options."
    if intent == "read_bullets":
        return "Here are your bullet points."
    if intent == "suggest_bullets":
        return "Let me suggest some bullet points."
    if intent == "use_bullet":
        return "Adding that bullet."
    if intent == "discard_bullet":
        return "Removing that bullet."
    if intent == "choose":
        return "Okay."
    if intent == "what_can_i_do":
        return "Here's what I can help with."
    if intent == "ask":
        return "Let me help with that."
    if intent == "unknown":
        return "Sorry, I didn't catch that — here are some things you can ask."
    return "Okay."


def _finalize(result: "IntentResult", raw: str, context: dict) -> "IntentResult":
    """Attach the utterance and a spoken reply to every result the API returns."""
    result.utterance = raw
    if not result.reply:
        result.reply = _reply_for(result, context)
    return result


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
    want_debug = bool(context.get("debug"))
    dbg: dict[str, Any] = {} if want_debug else {}
    raw = (transcript or "").strip()
    text = _norm(raw)
    if not text:
        return _finalize(IntentResult("unknown", 0.0), raw, context)

    result = _deterministic(text, context)
    if want_debug:
        dbg["deterministic"] = {"intent": result.intent, "confidence": result.confidence}
        dbg["llm_available"] = llm is not None
        dbg["source"] = "deterministic"

    # Resolve a yes/no against a pending offer server-side: when the frontend passes the
    # armed offer's action as context["pending"], a spoken "yes" returns THAT action
    # directly (so it executes), and "no" is a clean decline — no fragile client mapping.
    pending = (context or {}).get("pending")
    if isinstance(pending, dict) and pending.get("intent"):
        if result.intent == "confirm":
            return _finalize(
                IntentResult(str(pending["intent"]), 0.95, dict(pending.get("slots") or {})),
                raw, context)
        if result.intent == "decline":
            return _finalize(IntentResult("decline", 0.95, {}), raw, context)

    if result.confidence < threshold:
        if llm is not None:
            llm_res = _llm_classify(raw, context, llm, debug=dbg if want_debug else None)
            if llm_res is not None and llm_res.confidence >= result.confidence:
                result = llm_res
                if want_debug:
                    dbg["source"] = "llm"
        # Still weak? Treat a substantive utterance as a free-form request.
        if result.confidence < threshold and result.intent in ("unknown",):
            if len(text.split()) >= 2:
                result = IntentResult("ask", 0.5, {"query": raw})
                if want_debug:
                    dbg["source"] = "fallback_ask"

    # Resolve against a pending offer again AFTER the LLM pass, so an affirmation/decline the
    # deterministic matcher missed but the LLM (or the ask-fallback on a bare "ok sure") still
    # reads as yes/no runs the offer — a flow stays reliable without the client staging every
    # phrasing. A substantive NEW command (navigate/search/…) preempts the offer instead.
    if isinstance(pending, dict) and pending.get("intent"):
        if result.intent == "confirm":
            result = IntentResult(str(pending["intent"]), 0.95, dict(pending.get("slots") or {}))
        elif result.intent == "decline":
            result = IntentResult("decline", 0.95, {})

    # A more_matches result (e.g. from the LLM backstop) carries the standard "connect more
    # sources" offer even if the matcher that produced it didn't set one.
    if result.intent == "more_matches" and not result.offer:
        result.offer = dict(_MORE_MATCHES_OFFER)

    # When we couldn't pin a concrete command, offer the nearest wordings we DO
    # understand, so the assistant suggests phrasing it can act on instead of a dead end.
    if result.intent in ("unknown", "ask"):
        result.suggestions = nearest_commands(raw, context)
        # Offer a web search ONLY for a GENERIC couldn't-understand — not a disambiguation
        # (a clarify slot / needs_disambiguation) or a result that already set its own reply.
        # If the request is coherent (not gibberish), offer to search the web for it so a real
        # request we can't handle internally doesn't dead-end. Surfaced as a yes/no the client
        # arms as `pending`, so a "yes" resolves to web_search server-side (P261).
        generic = (not result.slots.get("clarify")
                   and not result.needs_disambiguation and not result.reply)
        if generic and not _is_gibberish(raw):
            result.offer = {
                "prompt": f"I can't do that in the app — want me to search the web for “{raw.strip()[:70]}”?",
                "on_yes": {"intent": "web_search", "slots": {"query": raw.strip()}},
                "yes": "Search the web", "no": "No thanks",
            }
            result.reply = "I couldn't make sense of that for the app — want me to search the web for it?"

    if want_debug:
        dbg["final"] = {"intent": result.intent, "confidence": result.confidence, "slots": dict(result.slots)}
        result.debug = dbg

    return _finalize(result, raw, context)


_VOWELS = set("aeiou")


def _is_gibberish(text: str) -> bool:
    """A light guard so we don't offer a web search for keyboard-mash/garbled input.
    True for obvious junk; lenient otherwise so real requests still get the offer."""
    letters = [c for c in text.lower() if c.isalpha()]
    if len(letters) < 3:
        return True
    vowel_ratio = sum(1 for c in letters if c in _VOWELS) / len(letters)
    if vowel_ratio < 0.18:  # consonant mash like "asdfghjkl" / "qwrtzx"
        return True
    toks = text.split()
    if len(toks) == 1 and len(toks[0]) > 14:  # one long unbroken blob
        return True
    return False
