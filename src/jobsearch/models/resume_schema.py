"""JSON Resume schema (https://jsonresume.org) — the structured content model.

This is the canonical shape the app parses a résumé into, so the frontend can render
it into any open-source template/theme, and so AI improvements can target specific
fields. Field names follow the JSON Resume standard (camelCase) for theme
compatibility.
"""

from __future__ import annotations

import re
from typing import Optional

from pydantic import Field

from jobsearch.models.common import DomainModel


class ResumeLocation(DomainModel):
    address: str = ""
    city: str = ""
    region: str = ""
    postalCode: str = ""
    countryCode: str = ""


class ResumeProfile(DomainModel):
    network: str = ""  # e.g. "LinkedIn", "GitHub"
    username: str = ""
    url: str = ""


class ResumeBasics(DomainModel):
    name: str = ""
    label: str = ""  # headline, e.g. "IT Director"
    email: str = ""
    phone: str = ""
    url: str = ""
    summary: str = ""
    location: ResumeLocation = Field(default_factory=ResumeLocation)
    profiles: list[ResumeProfile] = Field(default_factory=list)


class ResumeWork(DomainModel):
    name: str = ""  # company/organization
    position: str = ""
    url: str = ""
    startDate: str = ""
    endDate: str = ""
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class ResumeEducation(DomainModel):
    institution: str = ""
    area: str = ""  # field of study
    studyType: str = ""  # degree
    startDate: str = ""
    endDate: str = ""
    score: str = ""
    courses: list[str] = Field(default_factory=list)


class ResumeSkill(DomainModel):
    name: str = ""
    level: str = ""
    keywords: list[str] = Field(default_factory=list)


class ResumeProject(DomainModel):
    name: str = ""
    description: str = ""
    highlights: list[str] = Field(default_factory=list)
    url: str = ""


class ResumeCertificate(DomainModel):
    name: str = ""
    issuer: str = ""
    date: str = ""


class ResumeData(DomainModel):
    """A résumé as JSON Resume — the interchange model for templates + AI edits."""

    basics: ResumeBasics = Field(default_factory=ResumeBasics)
    work: list[ResumeWork] = Field(default_factory=list)
    education: list[ResumeEducation] = Field(default_factory=list)
    skills: list[ResumeSkill] = Field(default_factory=list)
    projects: list[ResumeProject] = Field(default_factory=list)
    certificates: list[ResumeCertificate] = Field(default_factory=list)
    awards: list[dict] = Field(default_factory=list)
    languages: list[dict] = Field(default_factory=list)


def _dates(start: str, end: str) -> str:
    if start and end:
        return f" ({start} - {end})"
    return f" ({start or end})" if (start or end) else ""


def resume_data_to_markdown(data: ResumeData) -> str:
    """Serialize a JSON Resume object back to the canonical Markdown the app stores
    (so a structured AI improvement can be saved as a normal résumé version)."""
    lines: list[str] = []
    b = data.basics
    if b.name:
        lines.append(f"**{b.name}**")
    loc = b.location.city + (f", {b.location.region}" if b.location.region else "") if b.location.city else ""
    contact = " | ".join(x for x in [b.label, b.email, b.phone, loc] if x)
    if contact:
        lines.append(contact)
    if b.summary:
        lines += ["", "## Summary", b.summary]

    if data.work:
        lines += ["", "## Experience"]
        for w in data.work:
            head = " ".join(p for p in [f"**{w.position}**" if w.position else "",
                                        f"at {w.name}" if w.name else ""] if p) + _dates(w.startDate, w.endDate)
            if head.strip():
                lines.append(head.strip())
            if w.summary:
                lines.append(w.summary)
            lines += [f"- {h}" for h in w.highlights if h]

    if data.education:
        lines += ["", "## Education"]
        for e in data.education:
            deg = " ".join(p for p in [f"**{e.studyType}**" if e.studyType else "", e.area,
                                       f"- {e.institution}" if e.institution else ""] if p)
            lines.append((deg + _dates(e.startDate, e.endDate)).strip())

    if data.projects:
        lines += ["", "## Projects"]
        for p in data.projects:
            if p.name:
                lines.append(f"**{p.name}**" + (f" - {p.description}" if p.description else ""))
            lines += [f"- {h}" for h in p.highlights if h]

    if data.skills:
        lines += ["", "## Skills"]
        parts = [s.name for s in data.skills if s.name]
        parts += [k for s in data.skills for k in s.keywords]
        if parts:
            lines.append(", ".join(dict.fromkeys(parts)))

    return "\n".join(lines).strip()


_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_DATES_RE = re.compile(r"\(([^()]*)\)\s*$")


def _unbold(s: str) -> str:
    return _BOLD_RE.sub(r"\1", s).strip()


def _split_dates(s: str) -> tuple[str, str, str]:
    """Pull a trailing '(start - end)' / '(date)' off a line -> (head, start, end)."""
    m = _DATES_RE.search(s)
    if not m:
        return s.strip(), "", ""
    inner = m.group(1).strip()
    head = s[: m.start()].strip()
    if " - " in inner:
        a, b = inner.split(" - ", 1)
        return head, a.strip(), b.strip()
    return head, inner, ""


def parse_resume_markdown(text: str, *, label: str = "") -> ResumeData:
    """Deterministic inverse of :func:`resume_data_to_markdown` — parse the app's
    canonical résumé Markdown (and general heading/bullet résumés) into ``ResumeData``
    with NO LLM call, so rendering a preview is instant. Best-effort on arbitrary input;
    round-trips Markdown this app produced. Never invents facts."""
    data = ResumeData()
    data.basics.label = label
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    n = len(lines)
    is_head = lambda ln: ln.strip().startswith("##")  # noqa: E731

    idx = 0
    while idx < n and not lines[idx].strip():
        idx += 1
    # Name (first non-empty, non-heading, short line)
    if idx < n and not is_head(lines[idx]):
        cand = _unbold(lines[idx])
        if cand and len(cand) <= 80 and "@" not in cand and not cand.startswith("-"):
            data.basics.name = cand
            idx += 1
    while idx < n and not lines[idx].strip():
        idx += 1
    # Contact line ("Label | email | phone | City, Region")
    if idx < n and not is_head(lines[idx]) and ("|" in lines[idx] or "@" in lines[idx]):
        for part in (p.strip() for p in lines[idx].split("|")):
            if not part:
                continue
            if "@" in part and not data.basics.email:
                data.basics.email = part
            elif re.fullmatch(r"[+()\-.\s\d]{7,}", part) and not data.basics.phone:
                data.basics.phone = part
            elif "," in part and not data.basics.location.city:
                city, _, region = part.partition(",")
                data.basics.location.city = city.strip()
                data.basics.location.region = region.strip()
            elif not data.basics.label:
                data.basics.label = part
        idx += 1

    section = ""
    cur_work: Optional[ResumeWork] = None
    cur_proj: Optional[ResumeProject] = None

    def flush() -> None:
        nonlocal cur_work, cur_proj
        if cur_work is not None:
            data.work.append(cur_work)
            cur_work = None
        if cur_proj is not None:
            data.projects.append(cur_proj)
            cur_proj = None

    while idx < n:
        s = lines[idx].strip()
        idx += 1
        if not s:
            continue
        if s.startswith("##"):
            flush()
            section = s.lstrip("#").strip().lower()
            continue
        bullet = bool(re.match(r"^[-*•‣]\s+", s))  # a list item, not **bold**
        if section.startswith(("summary", "objective", "profile", "about")):
            data.basics.summary = (data.basics.summary + " " + s).strip() if data.basics.summary else s
        elif section.startswith(("experience", "work", "employment")):
            if bullet:
                if cur_work is None:
                    cur_work = ResumeWork()
                cur_work.highlights.append(s.lstrip("-*• ").strip())
            else:
                flush()
                head, start, end = _split_dates(s)
                hb = _unbold(head)
                position, _, company = hb.partition(" at ")
                cur_work = ResumeWork(position=position.strip(), name=company.strip(),
                                      startDate=start, endDate=end)
        elif section.startswith("education"):
            head, start, end = _split_dates(s)
            data.education.append(ResumeEducation(area=_unbold(head), startDate=start, endDate=end))
        elif section.startswith("project"):
            if bullet:
                if cur_proj is None:
                    cur_proj = ResumeProject()
                cur_proj.highlights.append(s.lstrip("-*• ").strip())
            else:
                flush()
                name, _, desc = _unbold(s).partition(" - ")
                cur_proj = ResumeProject(name=name.strip(), description=desc.strip())
        elif section.startswith("skill"):
            for part in re.split(r"[,•|]", s.lstrip("-*• ")):
                p = part.strip()
                if p:
                    data.skills.append(ResumeSkill(name=p))
        elif not data.basics.summary:
            data.basics.summary = s
    flush()
    return data


# A number, optionally with $, %, or a k/M/million-style magnitude suffix.
_METRIC_RE = re.compile(
    r"\$?\d[\d,]*(?:\.\d+)?\s?(?:%|k|m|bn|billion|million|thousand|hrs?|hours?|x)?",
    re.IGNORECASE,
)


def _norm_metric(tok: str) -> str:
    return re.sub(r"[\s,$]", "", tok).lower()


def _metrics(text: str) -> set[str]:
    return {_norm_metric(m) for m in _METRIC_RE.findall(text or "") if any(c.isdigit() for c in m)}


def new_number_flags(original_text: str, items: list[tuple[str, str]]) -> list[dict]:
    """Flag numbers in AI-improved text (``items`` = (field, text) pairs) that are NOT
    in the original — likely invented, for the user to verify. Conservative on purpose
    (may flag a reworded-but-true figure); it surfaces, it does not block."""
    original = _metrics(original_text)
    seen: set[tuple[str, str]] = set()
    flags: list[dict] = []
    for field, text in items:
        for m in _METRIC_RE.findall(text or ""):
            if not any(c.isdigit() for c in m):
                continue
            n = _norm_metric(m)
            if not n or n in original or (n, field) in seen:
                continue
            seen.add((n, field))
            flags.append({"value": m.strip(), "field": field, "text": (text or "").strip()})
    return flags


def find_new_metrics(original_text: str, data: "ResumeData") -> list[dict]:
    """Invented-metric flags for an improved résumé (see :func:`new_number_flags`)."""
    items: list[tuple[str, str]] = [("summary", data.basics.summary)]
    for i, w in enumerate(data.work):
        items.append((f"work[{i}].summary", w.summary))
        items += [(f"work[{i}].highlights[{j}]", h) for j, h in enumerate(w.highlights)]
    for i, p in enumerate(data.projects):
        items += [(f"projects[{i}].highlights[{j}]", h) for j, h in enumerate(p.highlights)]
    return new_number_flags(original_text, items)
