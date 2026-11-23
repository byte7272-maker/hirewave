"""Compartmentalize a résumé or cover letter so the assistant can *work the whole
document*, not just a flat bullet list.

The documents assistant used to drop the user straight into a "Bullets" pane and ask
"what would you like to do here?" — it had no model of the document as a structured
whole. This module gives it one:

* :func:`build_map` parses the document into an ordered **outline** — its sections
  (Summary, Experience, Education, Skills, …), the roles inside Experience, and the
  individual bullets / paragraphs — each with a stable anchor id and exact character
  range, so the client can scroll to and highlight any part on request ("go to
  Experience", "highlight Education", "read this bullet").
* Every bullet / paragraph is **analyzed** deterministically for issues worth acting
  on — chiefly **stale, period-bound metrics**: a figure tied to a fiscal year or
  quarter that is now in the past (e.g. "+4.9% FY2024" read in 2027). For each it
  builds a concrete web-research query (entity + metric + latest period) so the
  assistant can go find the current number instead of leaving a dated one in place.
* :func:`locate` finds where a word / phrase appears (whole document) for highlight —
  the cover-letter "find and highlight this paragraph" case.

Everything here is deterministic (no LLM) so the map + analysis are instant and stable;
the actual web refresh (:mod:`document_refresh`) layers on top with sources + an
optional LLM.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from jobsearch.models.resume_schema import _section_of  # heading detection (shared)

# --- bullet / block detection -----------------------------------------------
_BULLET_RE = re.compile(r"^(\s*)([-*•‣●▪·])\s+(.*)$")
_HEADING_HASH_RE = re.compile(r"^\s*#{1,6}\s+")


def _strip_markers(s: str) -> str:
    """Drop a leading bullet marker and inline **bold**/*italic*/[text](url) so a block
    reads (and compares) as plain prose."""
    s = _BULLET_RE.sub(r"\3", s or "").strip()
    s = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    return s.strip()


def _slug(s: str, n: int = 5) -> str:
    words = re.findall(r"[a-z0-9]+", (s or "").lower())
    return "-".join(words[:n]) or "x"


# --- metric / period / freshness vocabulary ---------------------------------
#: A figure: $/number with an optional %, magnitude, or unit suffix. Must contain a digit.
_METRIC_RE = re.compile(
    r"[+\-]?\$?\d[\d,]*(?:\.\d+)?\s?"
    r"(?:%|k|m|bn|b|billion|million|thousand|hrs?|hours?|x|pts?|percent|percentage points?|bps)?",
    re.I,
)
#: A fiscal-year / plain-year / quarter period. Captures the year so we can age it.
_FY_RE = re.compile(r"\bFY\s?'?((?:19|20)\d{2}|\d{2})\b", re.I)
_QTR_RE = re.compile(r"\bQ([1-4])\s?[,'\s-]*((?:19|20)\d{2}|'?\d{2})\b", re.I)
_YEAR_RE = re.compile(r"\b(?:in|for|as of|through|ending|since|during|year)\s+((?:19|20)\d{2})\b", re.I)
_BARE_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
#: Words that assert a figure is *current* — strengthen a stale flag when an old year is present.
_FRESH_RE = re.compile(
    r"\b(sustained|current(?:ly)?|ongoing|to date|year[- ]to[- ]date|ytd|latest|recent(?:ly)?|"
    r"now|present|continu(?:ed|ing|es)|maintain(?:ed|ing|s)?|running)\b",
    re.I,
)
#: Nouns that name the *kind* of metric — the subject of a research query.
_SUBJECT_RE = re.compile(
    r"\b((?:[A-Z]\.?[A-Z]?\.?\s+)?(?:[a-z]+\s+){0,3}?"
    r"(?:organic\s+)?(?:growth|revenue|sales|arr|mrr|market\s+share|retention|churn|margin|"
    r"profit|ebitda|users?|customers?|subscribers?|downloads?|headcount|nps|csat|uptime|"
    r"throughput|conversion|engagement|traffic|bookings?|pipeline|valuation))\b",
    re.I,
)
#: A capitalized organization / proper-noun phrase (2–4 words, allows &, 's).
_ORG_RE = re.compile(r"\b([A-Z][\w.&-]+(?:\s+[A-Z][\w.&-]+){0,3})(?:'s)?\b")
_MONTHS = {"January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December", "Monday", "Tuesday",
           "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
_ORG_STOP = {"I", "The", "A", "An", "US", "U.S", "U.S.", "UK", "EU", "AI", "IT", "VIP"}
#: Résumé bullets almost always open with a past-tense action verb ("Drove revenue…",
#: "Grew ARR…"). Capitalized at the sentence start, it otherwise looks like a proper noun
#: and poisons both the entity ("Drove") and the subject ("Drove organic revenue") — and
#: so the web-research query — so we never treat a bullet-leading action verb as the org.
_ACTION_VERBS = frozenset(w.lower() for w in (
    "Led", "Managed", "Drove", "Grew", "Increased", "Decreased", "Reduced", "Cut", "Built",
    "Created", "Developed", "Designed", "Launched", "Delivered", "Improved", "Achieved",
    "Directed", "Oversaw", "Spearheaded", "Established", "Implemented", "Generated",
    "Expanded", "Scaled", "Boosted", "Saved", "Won", "Closed", "Negotiated", "Streamlined",
    "Optimized", "Transformed", "Owned", "Ran", "Headed", "Coordinated", "Executed",
    "Produced", "Raised", "Secured", "Maintained", "Sustained", "Accelerated", "Pioneered",
    "Founded", "Revamped", "Overhauled", "Consolidated", "Automated", "Migrated",
    "Architected", "Shipped", "Supported", "Enabled", "Mentored", "Trained", "Hired",
    "Recruited", "Supervised", "Championed", "Drove", "Guided", "Initiated", "Introduced",
    "Orchestrated", "Partnered", "Positioned", "Refactored", "Rolled", "Standardized",
    "Unified", "Upgraded", "Contributed", "Drafted", "Analyzed", "Assembled", "Authored",
))

#: A role's tenure is "current" if its date range runs to the present rather than a past
#: end year — the signal for whether its figures should be the LATEST (current job) or are
#: frozen history (a job already left).
_PRESENT_RE = re.compile(r"\b(present|current(?:ly)?|now|ongoing|to date|date)\b", re.I)
_DATE_RANGE_RE = re.compile(
    r"((?:19|20)\d{2})\s*(?:[-–—]|to|through|\bto\b|→)+\s*"
    r"(present|current|now|ongoing|(?:19|20)\d{2})", re.I)


def _tenure_current(line: str) -> Optional[bool]:
    """Read a role/date chrome line and decide if the role is CURRENT (ongoing), PAST
    (ended in a prior year), or unknown (no date range on this line → ``None``)."""
    m = _DATE_RANGE_RE.search(line or "")
    if m:
        end = m.group(2)
        if _PRESENT_RE.search(end):
            return True
        if re.fullmatch(r"(?:19|20)\d{2}", end.strip()):
            return int(end) >= _today_year()
    # a lone "Present"/"ongoing" alongside a start year, no explicit range glyph
    if _PRESENT_RE.search(line or "") and _BARE_YEAR_RE.search(line or ""):
        return True
    return None


def _today_year() -> int:
    return date.today().year


def _norm_year(tok: str) -> int:
    """Normalize a year token ('2024', '24', "'24") to a 4-digit year."""
    t = tok.strip().lstrip("'")
    if len(t) == 2:
        n = int(t)
        return 2000 + n if n <= (date.today().year % 100) + 1 else 1900 + n
    return int(t)


def _periods(text: str) -> list[tuple[str, int]]:
    """Every period reference in the text as (raw_token, year). FY/Q/explicit-year cues
    first; bare 4-digit years only when no stronger cue matched (avoids treating an
    employment date range as a metric period unless it's the only signal)."""
    out: list[tuple[str, int]] = []
    for m in _FY_RE.finditer(text):
        out.append((m.group(0), _norm_year(m.group(1))))
    for m in _QTR_RE.finditer(text):
        out.append((m.group(0), _norm_year(m.group(2))))
    for m in _YEAR_RE.finditer(text):
        out.append((m.group(1), _norm_year(m.group(1))))
    if not out:
        for m in _BARE_YEAR_RE.finditer(text):
            out.append((m.group(1), _norm_year(m.group(1))))
    return out


def _is_year(s: str) -> bool:
    return bool(re.fullmatch(r"(?:19|20)\d{2}", s.strip().strip(",.;:'")))


def _metric_values(text: str) -> list[str]:
    vals: list[str] = []
    seen: set[str] = set()
    for m in _METRIC_RE.findall(text or ""):
        s = m.strip().strip(",.;:")  # trailing punctuation isn't part of the figure
        if s and any(c.isdigit() for c in s) and not _is_year(s) and s not in seen:
            seen.add(s)
            vals.append(s)
    return vals


def _entity(text: str) -> str:
    """The most likely organization the metric belongs to: the first capitalized
    multi-word proper noun that isn't a month/sentence-start filler. Falls back to the
    first standalone capitalized word (e.g. 'Publicis')."""
    best = ""
    for m in _ORG_RE.finditer(text):
        phrase = m.group(1).strip()
        head = phrase.split()[0]
        # a period token ("FY2024", "Q3", a bare year) is capitalized but is not an org
        if _FY_RE.match(head) or _QTR_RE.match(head) or re.match(r"(?:19|20)\d{2}\b", head):
            continue
        if head in _MONTHS or head in _ORG_STOP or head.lower() in _ACTION_VERBS:
            # a capitalized bullet-leading verb ("Drove", "Grew") is not an organization;
            # if it's a one-word candidate, drop it, and for a phrase drop the verb head.
            rest = phrase.split()[1:]
            if head.lower() in _ACTION_VERBS and len(rest) >= 2 and rest[0][:1].isupper():
                return " ".join(rest)  # "Drove Acme Corp" -> "Acme Corp"
            continue
        if " " in phrase:  # prefer a real multi-word org name
            return phrase
        best = best or phrase
    return best


def _subject(text: str) -> str:
    m = _SUBJECT_RE.search(text)
    if not m:
        return ""
    subj = re.sub(r"\s+", " ", m.group(1)).strip()
    words = subj.split()
    # drop a leading action verb the phrase picked up ("Drove organic revenue" ->
    # "organic revenue") so the metric subject — and the search query — reads cleanly.
    while words and words[0].lower() in _ACTION_VERBS:
        words = words[1:]
    # keep it tight — at most the last 3 words of the matched phrase
    return " ".join(words[-3:])


def analyze_block(text: str, *, year: Optional[int] = None,
                  current_role: Optional[bool] = None) -> dict[str, Any]:
    """Deterministic analysis of one bullet / paragraph. Surfaces issues worth acting on
    — principally a **stale period-bound metric**: a figure attached to a fiscal year /
    quarter that is now past. Returns::

        {"flags": [ {kind, severity, reason, values, period, year, gap} ],
         "research": {"query", "entity", "subject", "old_values", "latest_year"} | None,
         "metrics": [...], "has_metric": bool}

    ``year`` overrides "today" (testability).

    ``current_role`` says whether the bullet belongs to a role the person STILL holds:

    * ``True`` — a current job. A dated figure here is a claim about ongoing performance
      and should be the latest period, so an old one is flagged **stale_metric** (refresh).
    * ``False`` — a role already left. Its figures are *historical facts* that can't be
      "updated" to a current period — the job is over — so an old figure is recorded as a
      low-severity **historical_metric** (recognized as past experience, no refresh), never
      nagged as stale.
    * ``None`` — unknown (a summary line, a cover-letter paragraph, a standalone bullet):
      treat as refreshable (the prior behavior), since a figure presented without a past
      employer is usually a live claim."""
    now = year or _today_year()
    text = (text or "").strip()
    metrics = _metric_values(text)
    periods = _periods(text)
    has_fresh = bool(_FRESH_RE.search(text))
    flags: list[dict[str, Any]] = []
    research: Optional[dict[str, Any]] = None

    past = [(tok, yr) for tok, yr in periods if yr < now]
    if past and (metrics or has_fresh):
        newest_past = max(yr for _, yr in past)
        gap = now - newest_past
        toks = sorted({tok for tok, _ in past}, key=lambda t: t.lower())
        entity = _entity(text)
        subject = _subject(text)
        if metrics and current_role is False:
            # A past role's numbers are frozen history — recognize them as old experience,
            # don't push to "refresh" a job that's already ended.
            flags.append({
                "kind": "historical_metric", "severity": "low",
                "reason": (f"These figures are tied to {', '.join(toks)}, under a role you've "
                           "since moved on from — they're historical results, correct as they "
                           "stand. No update needed; refreshing only applies to a current role."),
                "values": metrics, "period": toks, "year": newest_past, "gap": gap,
            })
        elif metrics:
            where = ("your current role" if current_role else "this period")
            reason = (
                f"These figures are tied to {', '.join(toks)} — now {gap} year"
                f"{'s' if gap != 1 else ''} out of date"
                + (" for a role you still hold, so they should show the latest period. "
                   if current_role else ". ")
                + (f"{entity}'s " if entity else "")
                + (f"{subject} " if subject else "the latest numbers ")
                + "can likely be refreshed to the current period."
            )
            flags.append({
                "kind": "stale_metric", "severity": "high" if gap >= 2 else "medium",
                "reason": reason, "values": metrics, "period": toks,
                "year": newest_past, "gap": gap, "current_role": bool(current_role),
            })
            query = " ".join(p for p in [entity, subject, str(now)] if p).strip() \
                or f"{entity} latest results".strip()
            research = {
                "query": query or (subject + f" {now}").strip(), "entity": entity,
                "subject": subject, "old_values": metrics, "latest_year": now,
            }
        else:  # a "current/ongoing" claim pinned to an old year, no figure
            flags.append({
                "kind": "stale_date", "severity": "low",
                "reason": f"References {', '.join(toks)} as current — worth confirming it's "
                          f"still accurate {gap} year{'s' if gap != 1 else ''} on.",
                "values": [], "period": toks, "year": newest_past, "gap": gap,
            })
    return {"flags": flags, "research": research, "metrics": metrics,
            "has_metric": bool(metrics)}


# --- the document outline ----------------------------------------------------
#: The read-along lead-in for a line, resolved from its section so the client never has to
#: guess from a role name (an Experience bullet under "IT Regional Manager — …" is still a
#: "bullet"). Kept in sync with capabilities.SURFACE.documents.arrival.narration.intro_by_line_type.
_SECTION_INTRO = {
    "summary": "Your summary reads:",
    "experience": "This bullet reads:",
    "projects": "This bullet reads:",
    "skills": "This line reads:",
    "education": "This line reads:",
    "certifications": "This line reads:",
    "other": "Your headline reads:",   # the header block (name/title line)
}


def intro_for_line(canon: str, kind: str = "resume") -> str:
    """The read-aloud lead-in for a line in section ``canon`` — "This bullet reads:" for an
    Experience/Projects bullet, "Your summary reads:" for the summary, "This paragraph reads:"
    for a cover-letter paragraph, else "This line reads:"."""
    if (kind or "").lower().startswith("cover"):
        return "This paragraph reads:"
    return _SECTION_INTRO.get(canon, "This line reads:")


@dataclass
class Block:
    id: str
    kind: str           # "bullet" | "paragraph" | "line"
    text: str           # plain, marker-stripped
    raw: str            # verbatim document line/paragraph (an edit's `before`)
    line: int           # 0-based line index of its first line
    char_start: int
    char_end: int
    section: str        # canonical section id it belongs to
    analysis: dict = field(default_factory=dict)
    intro: str = ""     # read-aloud lead-in resolved from the section ("This bullet reads:")

    def as_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "text": self.text, "raw": self.raw,
            "line": self.line, "char_start": self.char_start, "char_end": self.char_end,
            "section": self.section, "intro": self.intro, "analysis": self.analysis,
        }


@dataclass
class Section:
    id: str
    canon: str          # summary/experience/education/skills/projects/certifications/other
    title: str
    line: int
    char_start: int
    char_end: int
    blocks: list[Block] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "id": self.id, "canon": self.canon, "title": self.title, "line": self.line,
            "char_start": self.char_start, "char_end": self.char_end,
            "blocks": [b.as_dict() for b in self.blocks],
        }


def _line_offsets(text: str) -> list[int]:
    """Char offset at which each line starts (lines split on '\n')."""
    offs = [0]
    for ln in text.split("\n")[:-1]:
        offs.append(offs[-1] + len(ln) + 1)
    return offs


_DEFAULT_SECTION = ("header", "other", "Header")


def build_map(text: str, *, kind: str = "resume", year: Optional[int] = None) -> dict[str, Any]:
    """Compartmentalize the document into sections + analyzed blocks with anchors.

    For a **résumé** (``kind="resume"``), bullets are the analyzable blocks and the
    heading lines open sections. For a **cover letter** (``kind="cover_letter"``), the
    body paragraphs are the blocks (prose, not bullets). Char ranges index into the
    exact ``text`` passed in, so the client highlights by range."""
    text = text or ""
    offs = _line_offsets(text)
    lines = text.split("\n")

    if kind == "cover_letter":
        return _build_letter_map(text, lines, offs, year=year)

    sections: list[Section] = []
    seen_ids: dict[str, int] = {}
    cur = Section(id="header", canon="other", title="Header", line=0,
                  char_start=0, char_end=len(text))
    cur_is_default = True

    def _open(canon: str, title: str, line: int, cstart: int) -> None:
        nonlocal cur, cur_is_default
        base = canon if canon != "other" else _slug(title)
        seen_ids[base] = seen_ids.get(base, 0) + 1
        sid = base if seen_ids[base] == 1 else f"{base}-{seen_ids[base]}"
        cur.char_end = cstart
        if not cur_is_default or cur.blocks:
            sections.append(cur)
        cur = Section(id=sid, canon=canon, title=title or base.title(), line=line,
                      char_start=cstart, char_end=len(text))
        cur_is_default = False

    # Role tenure within Experience: a date-bearing chrome line sets whether the role that
    # follows is current or past; its bullets inherit that so a current role's dated figures
    # are flagged for refresh while a past role's are recognized as frozen history.
    role_current: Optional[bool] = None
    seen_bullet_in_role = False
    for i, ln in enumerate(lines):
        cstart = offs[i]
        canon, _rest = _section_of(ln)
        if canon is not None:
            title = _HEADING_HASH_RE.sub("", ln).split(":")[0].strip() or canon.title()
            _open(canon, title, i, cstart)
            role_current, seen_bullet_in_role = None, False  # new section: role context resets
            continue
        bm = _BULLET_RE.match(ln)
        plain = _strip_markers(ln)
        if not plain:
            continue
        bkind = "bullet" if bm else "line"
        if bkind == "line":
            # non-bullet prose in a résumé is section chrome (role/company/date). In
            # Experience it carries the role's tenure; elsewhere it's just skipped.
            if cur.canon == "experience":
                tenure = _tenure_current(ln)
                if tenure is not None:
                    role_current, seen_bullet_in_role = tenure, False  # a new dated role
                elif seen_bullet_in_role:
                    role_current, seen_bullet_in_role = None, False  # new role header, date TBD
            continue
        cr = role_current if cur.canon == "experience" else None
        bid = f"{cur.id}-b{len([b for b in cur.blocks if b.kind == 'bullet']) + 1}"
        cur.blocks.append(Block(
            id=bid, kind="bullet", text=plain, raw=ln.rstrip(), line=i,
            char_start=cstart, char_end=cstart + len(ln),
            section=cur.id, intro=intro_for_line(cur.canon, "resume"),
            analysis=analyze_block(plain, year=year, current_role=cr),
        ))
        if cur.canon == "experience":
            seen_bullet_in_role = True
    if not cur_is_default or cur.blocks:
        sections.append(cur)

    return _finalize(text, "resume", sections)


def _build_letter_map(text: str, lines: list[str], offs: list[int], *,
                      year: Optional[int]) -> dict[str, Any]:
    """Cover letter: salutation + body paragraphs + closing as paragraph blocks."""
    body = Section(id="body", canon="body", title="Letter", line=0,
                   char_start=0, char_end=len(text))
    # Paragraph = run of non-blank lines separated by a blank line.
    i, n, pno = 0, len(lines), 0
    while i < n:
        if not lines[i].strip():
            i += 1
            continue
        start = i
        while i < n and lines[i].strip():
            i += 1
        chunk = "\n".join(lines[start:i]).strip()
        plain = _strip_markers(chunk)
        if plain:
            pno += 1
            body.blocks.append(Block(
                id=f"p{pno}", kind="paragraph", text=plain, raw=chunk, line=start,
                char_start=offs[start], char_end=offs[start] + len(chunk),
                section="body", intro=intro_for_line("body", "cover_letter"),
                analysis=analyze_block(plain, year=year),
            ))
    return _finalize(text, "cover_letter", [body])


def _finalize(text: str, kind: str, sections: list[Section]) -> dict[str, Any]:
    all_blocks = [b for s in sections for b in s.blocks]
    agg_flags: list[dict[str, Any]] = []
    for b in all_blocks:
        for fl in b.analysis.get("flags", []):
            agg_flags.append({"block": b.id, "section": b.section, "text": b.text, **fl})
    flagged = sum(1 for b in all_blocks if b.analysis.get("flags"))
    return {
        "kind": kind,
        "sections": [s.as_dict() for s in sections],
        "blocks": [b.as_dict() for b in all_blocks],
        "outline": [{"id": s.id, "canon": s.canon, "title": s.title,
                     "count": len(s.blocks)} for s in sections],
        "stats": {
            "sections": len(sections),
            "bullets": sum(1 for b in all_blocks if b.kind == "bullet"),
            "paragraphs": sum(1 for b in all_blocks if b.kind == "paragraph"),
            "flagged": flagged,
        },
        "flags": agg_flags,
    }


# --- locate (find + highlight a word / phrase) ------------------------------
_WORD_RE = re.compile(r"\w+")
_LOCATE_STOP = {"the", "a", "an", "of", "and", "to", "in", "on", "for", "with", "my", "me",
                "it", "this", "that", "is", "are", "where", "does", "say", "find", "show",
                "highlight", "word", "section", "go"}


#: A run of one or more leading bullet markers (so "- - - - **IT Leader**" is caught whole).
_LEADING_MARKERS_RE = re.compile(r"^(\s*)(?:[-*•‣●▪·]\s+)+(.*)$")


def normalize_document(text: str, *, kind: str = "resume") -> str:
    """Repair document structure that drifted from a clean résumé/cover letter:

    * **Collapse accumulated markers** — a line that picked up repeated bullet markers
      ("- - - - - - - - **IT Leader**", from a render↔markdown round-trip) is reduced to a
      single marker (or none, below).
    * **De-bullet the header and summary** — the name/title/contact lines and the Summary
      are prose, never list items, so any leading bullet marker there is stripped. Bullets
      stay only where they belong (Experience, Projects, Skills, …).

    Deterministic and idempotent: running it again changes nothing."""
    text = text or ""
    if (kind or "").lower().startswith("cover"):
        # A cover letter is prose end to end — no line should be a bullet.
        out = []
        for ln in text.split("\n"):
            m = _LEADING_MARKERS_RE.match(ln)
            out.append((m.group(1) + m.group(2)) if m else ln)
        return "\n".join(out)

    lines = text.split("\n")
    section = "header"  # everything before the first heading
    out: list[str] = []
    for ln in lines:
        canon, _rest = _section_of(ln)
        if canon is not None:
            section = canon
            out.append(ln)  # a heading line is left exactly as-is
            continue
        m = _LEADING_MARKERS_RE.match(ln)
        if not m:
            out.append(ln)
            continue
        indent, body = m.group(1), m.group(2)
        if section in ("header", "other", "summary"):
            out.append(indent + body)           # title/name/contact/summary: not a bullet
        else:
            out.append(indent + "- " + body)    # a real bullet: exactly one marker
    return "\n".join(out)


def locate(text: str, query: str, *, limit: int = 20) -> list[dict[str, Any]]:
    """Every place ``query`` appears in ``text`` (case-insensitive), as highlightable
    spans ``{line, char_start, char_end, match, snippet}``. Tries the whole phrase first;
    if it isn't present verbatim, falls back to the query's significant words so "where
    does it say leadership" still lands on 'leadership'."""
    text = text or ""
    q = (query or "").strip()
    if not q or not text:
        return []
    offs = _line_offsets(text)

    def _line_of(pos: int) -> int:
        lo, hi = 0, len(offs) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if offs[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo

    def _spans_for(needle: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not needle:
            return out
        for m in re.finditer(re.escape(needle), text, re.I):
            line = _line_of(m.start())
            ls = offs[line]
            le = text.find("\n", ls)
            le = len(text) if le < 0 else le
            out.append({
                "line": line, "char_start": m.start(), "char_end": m.end(),
                "match": text[m.start():m.end()],
                "snippet": text[ls:le].strip()[:200],
            })
            if len(out) >= limit:
                break
        return out

    spans = _spans_for(q)
    if spans:
        return spans
    words = [w for w in _WORD_RE.findall(q.lower()) if w not in _LOCATE_STOP and len(w) > 2]
    out: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    for w in words:
        for sp in _spans_for(w):
            key = (sp["char_start"], sp["char_end"])
            if key not in seen:
                seen.add(key)
                out.append(sp)
            if len(out) >= limit:
                return out
    return out
