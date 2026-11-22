"""Review the WHOLE résumé, section by section — not just the summary.

The summary review (:mod:`summary_review`) only looks at the top pitch. This walks the
entire document the way a person would read it: the **header** (name, title, contact),
the **summary**, each **experience role** with its dates and bullets, **education**, and
**skills**. For each section it produces an announce line + concrete findings (each with a
fix), an anchor to focus/spotlight, and — the point — an ordered narration **script** that
*offers to read the findings* and walks every section, so the assistant announces what it
found and moves through the document instead of printing a summary-only result in place.

Deterministic (reuses :mod:`document_map` for anchors + stale-metric analysis and
:mod:`summary_review` for the summary); an optional LLM only polishes the summary rewrite.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from jobsearch.engines.assistant import summary_review as _sr
from jobsearch.engines.assistant.document_map import (
    _entity, _metric_values, _PRESENT_RE, analyze_block, build_map,
)


def _role_is_current(w) -> Optional[bool]:
    """Whether a parsed role is one the person STILL holds — from its dates. An empty or
    "Present"/"Current" end date (with a start) is current; an end date in a past year is
    past; otherwise unknown. Drives whether its dated figures are refreshable (current job →
    latest numbers) or frozen history (a job already left)."""
    from jobsearch.engines.assistant.document_map import _today_year

    end = (getattr(w, "endDate", "") or "").strip()
    start = (getattr(w, "startDate", "") or "").strip()
    if not end:
        return True if start else None
    if _PRESENT_RE.search(end):
        return True
    yrs = re.findall(r"(?:19|20)\d{2}", end)
    if yrs:
        return int(yrs[-1]) >= _today_year()
    return None


def _clean_role(position: str) -> tuple[str, str]:
    """Split a parsed position that may carry the company ('Acme -- IT Manager') into
    (title, company)."""
    p = (position or "").strip()
    m = re.split(r"\s+(?:--|—|–|\||·|at)\s+", p, maxsplit=1)
    if len(m) == 2:
        # heading is usually "Company -- Title"; title is the role-ish part
        a, b = m[0].strip(), m[1].strip()
        role_words = ("director", "manager", "engineer", "lead", "designer", "analyst",
                      "developer", "officer", "head", "president", "consultant", "architect",
                      "specialist", "coordinator", "administrator", "scientist")
        if any(w in b.lower() for w in role_words):
            return b, a
        if any(w in a.lower() for w in role_words):
            return a, b
        return b, a
    return p, ""


def _section_anchor(sec) -> dict:
    return {"section_id": sec["id"], "char_start": sec["char_start"], "char_end": sec["char_end"]}


def _finding(fid, section, title, detail, severity, fix, locate=""):
    return {"id": fid, "section": section, "title": title, "detail": detail,
            "severity": severity, "fix": fix, "locate": locate}


# --- per-section analyzers ---------------------------------------------------
def _header(data, resume_text: str, header_anchor: dict) -> dict:
    b = data.basics
    findings: list[dict] = []
    if not (b.name or "").strip():
        findings.append(_finding("no_name", "header", "No name at the top",
                                 "Your résumé doesn't lead with your name.", "high",
                                 "Put your full name on the first line."))
    if not (b.label or "").strip():
        findings.append(_finding("no_title", "header", "No headline role",
                                 "There's no role/title under your name.", "high",
                                 "Add your target title (e.g. 'IT Director') under your name."))
    if not (b.email or "").strip():
        findings.append(_finding("no_contact", "header", "No contact line",
                                 "I don't see an email or contact details.", "medium",
                                 "Add an email (and phone/location) so employers can reach you.",
                                 locate=""))
    who = (b.label or "").strip()
    announce = ("Starting at the top" + (f" — you lead as {who}." if who else ".")
                if not findings else
                "Starting at the top — a couple of things to firm up in your header.")
    return {"canon": "header", "title": "Header", "anchor": header_anchor,
            "announce": announce, "findings": findings}


def _summary_section(resume_text: str, data, year, llm) -> dict:
    rev = _sr.review_summary(resume_text, data=data, year=year, llm=llm)
    findings = [_finding(w["id"], "summary", w["title"], w["detail"], w["severity"],
                         w["fix"], w.get("locate", "")) for w in rev["weaknesses"]]
    reads = rev["understanding"].get("reads_as", "")
    announce = ("Your summary: " + reads if reads else "Your summary.")
    return {"canon": "summary", "title": "Summary", "anchor": rev.get("anchor"),
            "announce": announce, "findings": findings,
            "suggestion": rev.get("suggestion", ""), "fresh": rev.get("fresh", False)}


def _experience(data, resume_text: str, exp_sec, year) -> dict:
    anchor = _section_anchor(exp_sec) if exp_sec else None
    roles = list(getattr(data, "work", []) or [])
    findings: list[dict] = []
    for w in roles:
        title, company = _clean_role(getattr(w, "position", ""))
        label = title or company or "a role"
        where = (title + (f" at {company}" if company else "")) or "a role"
        if not (getattr(w, "startDate", "") or getattr(w, "endDate", "")):
            findings.append(_finding("role_dates", "experience", f"{label}: no dates",
                                     f"{where} has no dates.", "medium",
                                     f"Add start–end dates to {where}.", locate=label))
        highlights = [h for h in (getattr(w, "highlights", []) or []) if h.strip()]
        if not highlights:
            findings.append(_finding("role_no_bullets", "experience", f"{label}: no bullets",
                                     f"{where} has no bullet points.", "high",
                                     f"Add 2–3 bullets with results to {where}.", locate=label))
            continue
        no_metric = [h for h in highlights if not _metric_values(h)]
        current = _role_is_current(w)
        # Only a role you still hold should be nagged to refresh its figures; a past role's
        # numbers are historical facts (analyze_block records them, but doesn't flag stale).
        stale = [h for h in highlights if any(f["kind"] == "stale_metric"
                 for f in analyze_block(h, year=year, current_role=current).get("flags", []))]
        if stale:
            detail = (f"A bullet under {where} — a role you still hold — has figures tied to a "
                      "past period; they should show the latest numbers."
                      if current else
                      f"A bullet under {where} has figures tied to a past period.")
            findings.append(_finding("role_stale", "experience", f"{label}: dated figures",
                                     detail, "medium", "Refresh those numbers to the current period.",
                                     locate=(_metric_values(stale[0])[0] if _metric_values(stale[0]) else label)))
        if len(no_metric) == len(highlights):
            findings.append(_finding("role_no_metric", "experience", f"{label}: no numbers",
                                     f"None of the bullets under {where} quantify the impact.",
                                     "medium", f"Add a number (%, $, scale) to a bullet under {where}.",
                                     locate=label))
    n = len(roles)
    if not n:
        findings.append(_finding("no_experience", "experience", "No experience listed",
                                 "There's no work experience section.", "high",
                                 "Add your roles with dates and a few quantified bullets."))
        announce = "I don't see any work experience yet."
    else:
        announce = (f"Your experience — {n} role{'s' if n != 1 else ''}"
                    + (", all with dates and quantified bullets. Solid." if not findings
                       else ". A few bullets could be stronger."))
    return {"canon": "experience", "title": "Experience", "anchor": anchor,
            "announce": announce, "findings": findings}


def _education(data, edu_sec) -> dict:
    anchor = _section_anchor(edu_sec) if edu_sec else None
    edu = list(getattr(data, "education", []) or [])
    findings: list[dict] = []
    if not edu:
        findings.append(_finding("no_education", "education", "No education section",
                                 "There's no education listed.", "low",
                                 "Add your degree and school (optional if you lead with experience)."))
        announce = "No education section — optional, but worth adding if you have a degree."
    else:
        announce = f"Your education — {len(edu)} entr{'ies' if len(edu) != 1 else 'y'}."
    return {"canon": "education", "title": "Education", "anchor": anchor,
            "announce": announce, "findings": findings}


def _skills(data, resume_text: str, skills_sec) -> dict:
    anchor = _section_anchor(skills_sec) if skills_sec else None
    skills = [s for s in (getattr(data, "skills", []) or []) if getattr(s, "name", "").strip()]
    kw = [k for s in skills for k in (getattr(s, "keywords", []) or [])]
    total = len(skills) + len(kw)
    findings: list[dict] = []
    if total == 0:
        findings.append(_finding("no_skills", "skills", "No skills section",
                                 "There's no skills section.", "medium",
                                 "Add a skills line with your strongest, ATS-relevant skills."))
        announce = "No skills section — add one so ATS and recruiters can match you."
    elif total < 5:
        findings.append(_finding("thin_skills", "skills", "Thin skills list",
                                 f"Only {total} skill{'s' if total != 1 else ''} listed.", "low",
                                 "List more of your real, relevant skills (aim for 8–12)."))
        announce = f"Your skills — {total} listed; could be fuller."
    else:
        announce = f"Your skills — {total} listed. Good coverage."
    return {"canon": "skills", "title": "Skills", "anchor": anchor,
            "announce": announce, "findings": findings}


_SEV = {"high": 0, "medium": 1, "low": 2}


def review_document(resume_text: str, *, data=None, year: Optional[int] = None,
                    llm=None) -> dict[str, Any]:
    """A whole-résumé review: every section analyzed with findings + a fix each, anchors to
    focus each one, and an ordered narration ``script`` that OFFERS to read the findings and
    walks the full document (header → summary → experience → education → skills)."""
    resume_text = resume_text or ""
    if data is None:
        from jobsearch.models.resume_schema import parse_resume_markdown
        data = parse_resume_markdown(resume_text)
    doc = build_map(resume_text, kind="resume")
    secs = doc["sections"]
    by_canon = {}
    for s in secs:
        by_canon.setdefault(s["canon"], s)
    header_end = secs[0]["char_start"] if secs else len(resume_text)
    header_anchor = {"section_id": "header", "char_start": 0, "char_end": header_end}

    walk = [
        _header(data, resume_text, header_anchor),
        _summary_section(resume_text, data, year, llm),
        _experience(data, resume_text, by_canon.get("experience"), year),
        _education(data, by_canon.get("education")),
        _skills(data, resume_text, by_canon.get("skills")),
    ]
    all_findings = [f for sec in walk for f in sec["findings"]]
    total = len(all_findings)
    roles = len(getattr(data, "work", []) or [])

    # The narration script: an OFFER to read, then a visit to every section (announce +
    # each finding), then a close. The client plays it; the offer/close are the ask steps.
    script: list[dict] = []

    def step(state, say, *, focus=None, locate="", section="", ask=False):
        script.append({"state": state, "say": say, "focus": focus, "locate": locate,
                       "section": section, "ask": ask})

    lead = (f"I read through your whole résumé — your header, summary, "
            f"{roles} role{'s' if roles != 1 else ''}, education, and skills. ")
    if total:
        lead += (f"I found {total} thing{'s' if total != 1 else ''} worth a look. "
                 "Want me to walk you through them, section by section?")
    else:
        lead += "It's in good shape top to bottom. Want me to walk you through it anyway?"
    step("offer", lead, focus=header_anchor, section="header", ask=True)

    for sec in walk:
        step("section", sec["announce"], focus=sec.get("anchor"), section=sec["canon"])
        for f in sorted(sec["findings"], key=lambda x: _SEV.get(x["severity"], 3)):
            step("finding", f"{f['title']}. {f['detail']} Here's the fix: {f['fix']}",
                 focus=sec.get("anchor"), locate=f.get("locate", ""), section=sec["canon"])

    if total:
        step("close", "That's the full pass. Want me to start fixing these, top to bottom?",
             focus=header_anchor, section="header", ask=True)
    else:
        step("close", "That's the full pass — nothing needs changing right now.",
             focus=header_anchor, section="header", ask=True)

    return {
        "kind": "resume",
        "sections": [
            {"canon": s["canon"], "title": s["title"], "anchor": s.get("anchor"),
             "announce": s["announce"], "findings": s["findings"]} for s in walk
        ],
        "findings": all_findings,
        "script": script,
        "stats": {"sections": len(walk), "findings": total, "roles": roles},
    }


# --- cover letter review -----------------------------------------------------
_SALUTE_RE = re.compile(r"^\s*(dear|hi|hello|greetings|to whom)\b", re.I)
_GENERIC_SALUTE_RE = re.compile(
    r"to whom it may concern|dear sir(?: or madam| ?/ ?madam|,| and madam)|dear madam", re.I)
_CLOSE_RE = re.compile(
    r"^\s*(sincerely|regards|best regards|best|respectfully|yours truly|yours sincerely|"
    r"warm regards|kind regards|cheers|thank you)\b", re.I)
_CTA_RE = re.compile(
    r"\b(look forward|welcome the (?:chance|opportunity)|would (?:love|welcome|be glad) to|"
    r"happy to discuss|available (?:for|to)|schedule|interview|discuss (?:how|my|the)|"
    r"hear from you|reach me|get in touch|speak (?:with you|further))\b", re.I)
_ROLE_NAMED_RE = re.compile(r"\b(position|role|opening|opportunity|job|vacancy|posting)\b", re.I)


def _blk_anchor(b) -> dict:
    return {"section_id": b["id"], "char_start": b["char_start"], "char_end": b["char_end"]}


def _words_in(text: str) -> int:
    return len(re.findall(r"[A-Za-z][A-Za-z'-]+", text or ""))


def review_cover_letter(cover_text: str, *, data=None, year: Optional[int] = None,
                        llm=None) -> dict[str, Any]:
    """A whole-cover-letter review: greeting, opening, each body paragraph, and closing —
    each with findings + a fix, an anchor to focus, and an ordered narration ``script`` that
    offers to read the findings and walks the letter top to bottom."""
    cover_text = cover_text or ""
    doc = build_map(cover_text, kind="cover_letter")
    paras = doc["blocks"]  # p1..pN, in order, each {id,text,char_start,char_end,analysis}
    sal_idx = next((i for i, p in enumerate(paras) if _SALUTE_RE.search(p["text"])), -1)
    close_idx = next((i for i in range(len(paras) - 1, -1, -1)
                      if _CLOSE_RE.search(paras[i]["text"])), len(paras))
    salutation = paras[sal_idx] if sal_idx >= 0 else None
    closing = paras[close_idx] if close_idx < len(paras) else None
    body = paras[(sal_idx + 1):close_idx] if sal_idx >= 0 else paras[:close_idx]
    body = [p for p in body if _words_in(p["text"]) >= 4]  # skip a lone date/name line

    names_role = bool(_ROLE_NAMED_RE.search(cover_text)) or bool(_entity(cover_text))
    any_metric = any(_metric_values(p["text"]) for p in body)

    walk: list[dict] = []

    def section(canon, title, anchor, announce, findings):
        walk.append({"canon": canon, "title": title, "anchor": anchor,
                     "announce": announce, "findings": findings})

    # greeting
    g_find: list[dict] = []
    if salutation is None:
        g_find.append(_finding("no_greeting", "greeting", "No greeting",
                               "The letter doesn't open with a salutation.", "low",
                               "Open with 'Dear [name or team],'."))
        g_announce = "There's no greeting at the top."
    else:
        if _GENERIC_SALUTE_RE.search(salutation["text"]):
            g_find.append(_finding("generic_greeting", "greeting", "Generic greeting",
                                   f"'{salutation['text'][:40]}' is impersonal.", "low",
                                   "Address the hiring manager or team by name if you can.",
                                   locate=salutation["text"][:30]))
        g_announce = "Your greeting" + (" — looks good." if not g_find else " is a bit generic.")
    section("greeting", "Greeting", _blk_anchor(salutation) if salutation else None,
            g_announce, g_find)

    # opening (first body paragraph)
    if body:
        op = body[0]
        o_find: list[dict] = []
        if not names_role:
            o_find.append(_finding("no_role_named", "opening", "Doesn't name the role",
                                   "The letter doesn't name the specific role or company.", "medium",
                                   "State the exact role and company in the first line.",
                                   locate=op["text"][:30]))
        if _words_in(op["text"]) < 20:
            o_find.append(_finding("thin_opening", "opening", "Thin opening",
                                   "The opening is too short to hook the reader.", "low",
                                   "Lead with the role and why you're a strong fit."))
        section("opening", "Opening", _blk_anchor(op),
                "Your opening paragraph" + (" sets it up well." if not o_find else " could hook harder."),
                o_find)
        rest = body[1:]
    else:
        section("opening", "Opening", None, "There's no opening paragraph.",
                [_finding("no_body", "opening", "No body", "The letter has no body paragraphs.",
                          "high", "Add 1–2 paragraphs with concrete evidence.")])
        rest = []

    # body (remaining evidence paragraphs)
    b_find: list[dict] = []
    for p in rest:
        st = [f for f in p["analysis"].get("flags", []) if f["kind"] == "stale_metric"]
        if st:
            vals = st[0].get("values", [])
            b_find.append(_finding("stale_metric", "body", "Dated figures in a paragraph",
                                   "A paragraph cites figures tied to a past period.", "medium",
                                   "Refresh those numbers to the current period.",
                                   locate=(vals[0] if vals else p["text"][:30])))
        if _words_in(p["text"]) > 130:
            b_find.append(_finding("long_paragraph", "body", "A paragraph runs long",
                                   "One body paragraph is dense enough to lose the reader.", "low",
                                   "Split it or tighten to the strongest point.",
                                   locate=p["text"][:30]))
    if rest and not any_metric:
        b_find.insert(0, _finding("no_evidence", "body", "No concrete results",
                                  "The body makes no measurable claim.", "medium",
                                  "Back a claim with a number — a %, $, or scale."))
    if rest:
        section("body", "Body", _blk_anchor(rest[0]),
                f"The body — {len(rest)} more paragraph{'s' if len(rest) != 1 else ''}"
                + (". Makes the case." if not b_find else ". A few spots to strengthen."), b_find)

    # closing
    c_find: list[dict] = []
    tail_text = " ".join(p["text"] for p in (body[-1:] + ([closing] if closing else [])))
    if not _CTA_RE.search(tail_text):
        c_find.append(_finding("no_cta", "closing", "No call to action",
                               "The ending doesn't ask for the next step.", "medium",
                               "Close by inviting an interview or a conversation."))
    if closing is None:
        c_find.append(_finding("no_signoff", "closing", "No sign-off",
                               "There's no 'Sincerely,' + your name.", "low",
                               "Add a sign-off and your name."))
    section("closing", "Closing", _blk_anchor(closing) if closing else
            (_blk_anchor(body[-1]) if body else None),
            "Your closing" + (" lands it." if not c_find else " needs a clear ask."), c_find)

    all_findings = [f for s in walk for f in s["findings"]]
    total = len(all_findings)
    script: list[dict] = []

    def step(state, say, *, focus=None, locate="", section_id="", ask=False):
        script.append({"state": state, "say": say, "focus": focus, "locate": locate,
                       "section": section_id, "ask": ask})

    top_anchor = walk[0]["anchor"]
    lead = f"I read your whole cover letter — the greeting, opening, body, and closing. "
    lead += (f"I found {total} thing{'s' if total != 1 else ''} worth a look. "
             "Want me to walk you through them?" if total else
             "It reads well top to bottom. Want me to walk you through it anyway?")
    step("offer", lead, focus=top_anchor, section_id="greeting", ask=True)
    for s in walk:
        step("section", s["announce"], focus=s.get("anchor"), section_id=s["canon"])
        for f in sorted(s["findings"], key=lambda x: _SEV.get(x["severity"], 3)):
            step("finding", f"{f['title']}. {f['detail']} Here's the fix: {f['fix']}",
                 focus=s.get("anchor"), locate=f.get("locate", ""), section_id=s["canon"])
    step("close",
         "That's the full pass. Want me to start fixing these, top to bottom?" if total
         else "That's the full pass — nothing needs changing right now.",
         focus=top_anchor, section_id="greeting", ask=True)

    return {
        "kind": "cover_letter",
        "sections": [{"canon": s["canon"], "title": s["title"], "anchor": s.get("anchor"),
                      "announce": s["announce"], "findings": s["findings"]} for s in walk],
        "findings": all_findings,
        "script": script,
        "stats": {"sections": len(walk), "findings": total,
                  "paragraphs": len([p for p in paras if _words_in(p["text"]) >= 4])},
    }


def review(text: str, *, kind: str = "resume", data=None, year: Optional[int] = None,
           llm=None) -> dict[str, Any]:
    """Whole-document review for either doc type. ``kind`` "cover_letter" walks the letter;
    anything else walks the résumé."""
    if (kind or "").lower().startswith("cover"):
        return review_cover_letter(text, data=data, year=year, llm=llm)
    return review_document(text, data=data, year=year, llm=llm)
