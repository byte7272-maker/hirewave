"""Keep the résumé **Summary** understood and fresh, not just rendered.

A summary goes stale: you add a role, swap your focus, pick up new skills, land a
bigger number — and the two-line pitch at the top still describes last year's you. This
module makes the assistant actually *read and understand* the summary and act on it:

* :func:`review_summary` parses what the summary currently claims (seniority, role,
  named skills, whether it quantifies anything), checks it against the REST of the
  résumé, and against writing-quality heuristics.
* It returns a list of concrete **weaknesses**, each with the fix that addresses it, a
  plain-language **understanding** of what the summary says today, a **freshness**
  verdict (is it still in sync with the document, and did the document change since the
  summary was last refreshed?), and a proposed **rewrite** that resolves the weaknesses
  using only facts already in the résumé.
* A **fingerprint** of the document's key signals (roles, top skills, metrics) lets the
  client tell when a *major change* has happened since the summary was last updated, so
  the assistant can prompt a periodic refresh instead of letting it drift.

Deterministic by default (instant, stable); an optional LLM only polishes the rewrite.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Optional

from jobsearch.engines.assistant.document_map import _metric_values, analyze_block
from jobsearch.engines.sourcing.skills import extract_skills

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'&/-]+")
_SENT_RE = re.compile(r"(?<=[.!?])\s+")
#: Clichéd openers that say nothing specific.
_CLICHE_RE = re.compile(
    r"\b(results?[- ]driven|hard[- ]working|team[- ]player|detail[- ]oriented|"
    r"self[- ]starter|go[- ]getter|motivated professional|passionate (?:about )?professional|"
    r"seasoned professional|dynamic professional|highly motivated|proven track record|"
    r"excellent communication|think outside the box|synergy)\b", re.I)
_FIRST_PERSON_RE = re.compile(r"\b(i am|i'?m|i have|i've|my )\b", re.I)
_YEARS_RE = re.compile(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", re.I)

#: Summary length guidance (words).
_MIN_WORDS = 18
_MAX_WORDS = 75


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text or "")


def _norm_tokens(text: str) -> set[str]:
    return {w.lower() for w in _words(text) if len(w) > 2}


def _summary_text(data, resume_text: str) -> str:
    """The summary body — the parsed basics.summary, else the Summary section's text."""
    s = (getattr(getattr(data, "basics", None), "summary", "") or "").strip()
    if s:
        return s
    from jobsearch.engines.assistant.document_map import build_map

    for sec in build_map(resume_text, kind="resume").get("sections", []):
        if sec.get("canon") == "summary":
            # the section's own prose lines (non-heading); blocks are bullets, so read raw slice
            start, end = sec.get("char_start", 0), sec.get("char_end", 0)
            chunk = resume_text[start:end]
            lines = [ln.strip() for ln in chunk.split("\n")[1:] if ln.strip()]
            return " ".join(lines).strip()
    return ""


def _body_signals(data, resume_text: str, summary: str) -> dict[str, Any]:
    """The current document's key signals the summary should reflect: the most-recent
    role, the companies, the strongest skills, and the metric set."""
    work = list(getattr(data, "work", []) or [])
    current = work[0] if work else None
    # Prefer the headline label (the clean role title, e.g. "IT Director") over the parsed
    # position, which can swallow the company on an unusual heading line.
    role = (getattr(data.basics, "label", "") or getattr(current, "position", "")).strip()
    role = re.sub(r"\*+|\s*\(.*?\)\s*$", "", role).strip(" -–—|")
    company = getattr(current, "name", "").strip() if current else ""
    # Top skills from the BODY only (exclude the summary so "missing from summary" is real).
    body_text = resume_text.replace(summary, " ") if summary else resume_text
    top_skills = extract_skills(body_text, limit=10)
    metrics = _metric_values(resume_text)
    return {"role": role, "company": company, "top_skills": top_skills,
            "metrics": sorted(metrics)[:12],
            "roles": [getattr(w, "position", "").strip() for w in work if getattr(w, "position", "")],
            "companies": [getattr(w, "name", "").strip() for w in work if getattr(w, "name", "")]}


def fingerprint(signals: dict[str, Any]) -> str:
    """A stable hash of the document's key signals (roles, companies, top skills, metrics).
    When it changes, the document changed materially since the summary was last refreshed."""
    basis = "|".join([
        ";".join(signals.get("roles", [])).lower(),
        ";".join(signals.get("companies", [])).lower(),
        ";".join(sorted(s.lower() for s in signals.get("top_skills", []))),
        ";".join(signals.get("metrics", [])),
    ])
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:12]


def _understanding(summary: str, signals: dict) -> dict[str, Any]:
    """A plain read of what the summary CLAIMS today — so the assistant understands it,
    not just reads it back."""
    toks = _norm_tokens(summary)
    ym = _YEARS_RE.search(summary)
    years = ym.group(1) + "+ years" if ym else ""
    named_skills = [s for s in signals["top_skills"] if _norm_tokens(s) <= toks][:6]
    role_words = _norm_tokens(signals["role"])
    states_role = bool(role_words and role_words <= toks) or (
        signals["role"].lower() in summary.lower() if signals["role"] else False)
    quantifies = bool(_metric_values(summary))
    sentences = [s.strip() for s in _SENT_RE.split(summary.strip()) if s.strip()]
    read = []
    if states_role and signals["role"]:
        read.append(f"positions you as a {signals['role']}")
    if years:
        read.append(f"claims {years}")
    if named_skills:
        read.append("names " + ", ".join(named_skills[:4]))
    read.append("quantifies your impact" if quantifies else "doesn't cite a number")
    return {
        "reads_as": "Your summary " + "; ".join(read) + "." if read else
                    "Your summary is empty.",
        "years": years, "states_role": states_role, "named_skills": named_skills,
        "quantifies": quantifies, "sentences": sentences, "word_count": len(_words(summary)),
    }


def _weaknesses(summary: str, signals: dict, und: dict, year: Optional[int]) -> list[dict]:
    """Concrete, de-duplicated weaknesses — each with the fix that addresses it."""
    out: list[dict] = []

    def add(wid, title, detail, severity, fix):
        out.append({"id": wid, "title": title, "detail": detail,
                    "severity": severity, "fix": fix})

    wc = und["word_count"]
    if not summary.strip():
        add("missing", "No summary yet", "The top of your résumé has no summary to anchor it.",
            "high", f"Add a 2–3 line summary leading with your role"
                    f"{' (' + signals['role'] + ')' if signals['role'] else ''} and a quantified win.")
        return out  # nothing else to critique
    if wc < _MIN_WORDS:
        add("too_short", "Too thin", f"At {wc} words it's too sparse to make a case.",
            "medium", "Expand to 2–3 lines: role, focus, and one quantified result.")
    elif wc > _MAX_WORDS:
        add("too_long", "Too long", f"At {wc} words it reads as a paragraph, not a hook.",
            "low", "Tighten to 2–3 lines; keep the strongest claim, cut the rest.")
    if not und["states_role"] and signals["role"]:
        add("no_role", "Doesn't lead with your role",
            f"It doesn't surface your current role ({signals['role']}).",
            "high", f"Open with your title — e.g. '{signals['role']} with …'.")
    if _CLICHE_RE.search(summary):
        hit = _CLICHE_RE.search(summary).group(0)
        add("cliche", "Opens with a cliché", f"'{hit}' is filler that says nothing specific.",
            "medium", "Replace the cliché with a concrete role + a real result.")
    if not und["quantifies"]:
        add("no_metric", "No quantified impact", "It makes no measurable claim.",
            "medium", "Fold in one number from your experience (a %, $, or scale).")
    missing = [s for s in signals["top_skills"][:5]
               if not (_norm_tokens(s) <= _norm_tokens(summary))][:3]
    if missing:
        add("missing_skills", "Omits your strongest skills",
            "Skills that run through your experience aren't in the summary: "
            + ", ".join(missing) + ".",
            "medium", "Work in " + ", ".join(missing[:2]) + " — they're your strongest signal.")
    if _FIRST_PERSON_RE.search(summary):
        add("first_person", "Written in the first person",
            "Résumé summaries read as implied-first-person, without 'I'.",
            "low", "Drop 'I/my' — start with the role or an action.")
    # dated figures inside the summary
    sa = analyze_block(summary, year=year)
    if any(f["kind"] == "stale_metric" for f in sa.get("flags", [])):
        add("stale_metric", "Contains dated figures",
            "A figure in the summary is tied to a past period.",
            "medium", "Refresh the number to the current period (Refresh figures).")
    sev = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda w: sev.get(w["severity"], 3))
    return out


def _suggestion(summary: str, signals: dict, und: dict) -> str:
    """A rewritten summary scaffold built ONLY from résumé facts (role, years, top skills,
    a quantified win) — a starting draft the user edits, never invented claims."""
    role = signals["role"] or "Professional"
    years = und["years"] or ""
    skills = signals["top_skills"][:3]
    lead = role + (f" with {years}" if years else "")
    if skills:
        lead += " specializing in " + ", ".join(skills)
    lead += "."
    # a quantified achievement from the metric set, if the body has one
    win = ""
    if signals["metrics"]:
        win = (" Proven impact includes measurable results such as "
               + ", ".join(signals["metrics"][:2]) + " — quantify the win in your own words.")
    return (lead + win).strip()


def review_summary(resume_text: str, *, data=None, year: Optional[int] = None,
                   last_fingerprint: str = "", llm=None) -> dict[str, Any]:
    """Understand, critique, and freshness-check the résumé summary. Returns::

        {present, summary, understanding, weaknesses[], suggestion,
         fresh, stale_reasons[], changed_since_review, fingerprint, signals}

    ``last_fingerprint`` is the fingerprint the client stored when the summary was last
    refreshed; a mismatch means the document changed materially since (prompt a refresh).
    """
    resume_text = resume_text or ""
    if data is None:
        from jobsearch.models.resume_schema import parse_resume_markdown
        data = parse_resume_markdown(resume_text)
    summary = _summary_text(data, resume_text)
    signals = _body_signals(data, resume_text, summary)
    fp = fingerprint(signals)
    und = _understanding(summary, signals)
    weaknesses = _weaknesses(summary, signals, und, year)

    # Freshness: drift (current role / top skills missing from the summary) + a fingerprint
    # change since the last review (a major document change).
    stale_reasons: list[str] = []
    if summary and signals["role"] and not und["states_role"]:
        stale_reasons.append(f"it doesn't mention your current role as {signals['role']}")
    missing_top = [s for s in signals["top_skills"][:3]
                   if not (_norm_tokens(s) <= _norm_tokens(summary))]
    if summary and missing_top:
        stale_reasons.append("it leaves out your strongest skills (" + ", ".join(missing_top[:2]) + ")")
    changed_since_review = bool(last_fingerprint) and last_fingerprint != fp
    if changed_since_review:
        stale_reasons.insert(0, "your résumé changed since the summary was last refreshed")
    fresh = bool(summary) and not stale_reasons and not changed_since_review

    suggestion = _suggestion(summary, signals, und)
    if llm is not None and summary:
        polished = _llm_rewrite(summary, signals, weaknesses, llm)
        if polished:
            suggestion = polished

    return {
        "present": bool(summary),
        "summary": summary,
        "understanding": und,
        "weaknesses": weaknesses,
        "suggestion": suggestion,
        "fresh": fresh,
        "stale_reasons": stale_reasons,
        "changed_since_review": changed_since_review,
        "fingerprint": fp,
        "signals": {"role": signals["role"], "company": signals["company"],
                    "top_skills": signals["top_skills"][:6], "metrics": signals["metrics"][:6]},
    }


_LLM_SYSTEM = (
    "You rewrite a résumé SUMMARY (the 2–3 line pitch at the top). You get the current "
    "summary, the candidate's actual role, top skills and metrics from elsewhere in the "
    "résumé, and the weaknesses to fix. Rewrite the summary to fix those weaknesses using "
    "ONLY facts given — never invent a number, title, employer, or skill. Keep it to 2–3 "
    "lines, lead with the role, work in the top skills, and include a real quantified win "
    "if one is provided. Output ONLY the rewritten summary text, nothing else."
)


def _supports_system(llm) -> bool:
    try:
        import inspect
        return "system" in inspect.signature(llm.complete).parameters
    except (ValueError, TypeError):
        return False


def _llm_rewrite(summary: str, signals: dict, weaknesses: list[dict], llm) -> str:
    try:
        prompt = (
            f"CURRENT SUMMARY:\n{summary}\n\n"
            f"ROLE: {signals['role']}\nTOP SKILLS: {', '.join(signals['top_skills'][:6])}\n"
            f"METRICS AVAILABLE: {', '.join(signals['metrics'][:6]) or '(none)'}\n"
            f"WEAKNESSES TO FIX: {'; '.join(w['title'] for w in weaknesses) or '(polish)'}"
        )
        out = (llm.complete(prompt, system=_LLM_SYSTEM) if _supports_system(llm)
               else llm.complete(_LLM_SYSTEM + "\n\n" + prompt)).strip()
        return out if 0 < len(_words(out)) <= 90 else ""
    except Exception:  # noqa: BLE001
        return ""
