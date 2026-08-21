"""Gather a user's profile data from LinkedIn.

Three tiers, tried in order of what's actually available:

* **Tier A — connected account** (``http``): fetch the OpenID Connect *userinfo*
  claims (or a partner-API proxy you point ``linkedin_profile_url`` at) with the
  encrypted OAuth token stored when the user connected. Standard scopes return
  identity only; a partner proxy can return the rich profile.
* **Tier C — data export**: the user uploads their own "Download your data"
  archive / exported résumé; :func:`parse_export_text` turns it into a profile.
* **mock**: a deterministic demo profile so the whole flow is testable offline.

Everything maps into the platform's own :class:`UserProfile`. Imports are
returned as a *draft* for the user to review before anything is saved.
"""

from __future__ import annotations

import re
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings
from jobsearch.models.user import Education, JobPreferences, UserProfile, WorkExperience


# --- provider (Tier A) ------------------------------------------------------
@runtime_checkable
class LinkedInProfileProvider(Protocol):
    """Returns raw profile claims for an access token. ``source`` labels where
    the data came from (shown to the user)."""

    @property
    def source(self) -> str: ...

    def fetch(self, access_token: str) -> dict: ...


class MockLinkedInProfileProvider:
    """Deterministic demo profile — no LinkedIn app required."""

    source = "mock"

    def fetch(self, access_token: str) -> dict:
        return {
            "sub": "mock|linkedin",
            "name": "Alex Rivera",
            "given_name": "Alex",
            "family_name": "Rivera",
            "email": "alex.rivera@example.com",
            "locale": "en-US",
            "headline": "Senior Product Designer",
            "summary": (
                "Product designer with 8 years shipping payments and fintech "
                "products end-to-end, from research to polished UI."
            ),
            "skills": ["Figma", "Design Systems", "Prototyping", "User Research", "Accessibility"],
            "positions": [
                {"title": "Senior Product Designer", "company": "Figma", "start": "2021",
                 "end": "", "summary": "Lead designer on the checkout experience.",
                 "highlights": ["Redesigned checkout, lifting conversion 18%."]},
                {"title": "Product Designer", "company": "Ramp", "start": "2018", "end": "2021",
                 "summary": "Owned the expense-review flows.", "highlights": []},
            ],
            "educations": [
                {"institution": "Rhode Island School of Design", "degree": "BFA",
                 "field_of_study": "Graphic Design", "graduation_year": 2016}
            ],
        }


class HttpLinkedInProfileProvider:
    """Live fetch from LinkedIn's userinfo endpoint (or a partner proxy)."""

    source = "linkedin"

    def __init__(self, url: str, *, timeout: float = 20.0) -> None:
        self._url = url
        self._timeout = timeout

    def fetch(self, access_token: str) -> dict:  # pragma: no cover - network
        import httpx

        try:
            resp = httpx.get(
                self._url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"LinkedIn profile fetch failed: {exc}") from exc
        return data if isinstance(data, dict) else {}


def build_linkedin_provider(settings: Optional[Settings] = None) -> LinkedInProfileProvider:
    s = settings or get_settings()
    if s.linkedin_profile_provider == "http" and s.linkedin_profile_url:
        return HttpLinkedInProfileProvider(s.linkedin_profile_url, timeout=s.linkedin_profile_timeout_seconds)
    return MockLinkedInProfileProvider()


# --- mapping (claims → UserProfile) ----------------------------------------
def map_claims_to_profile(user_id: str, claims: dict) -> UserProfile:
    """Map userinfo / rich profile claims into a draft UserProfile.

    Only fields that are present are populated — standard userinfo yields just a
    headline from the display name; a partner/rich source fills the rest.
    """
    headline = str(claims.get("headline") or claims.get("name") or "").strip()
    summary = str(claims.get("summary") or "").strip()
    skills = [str(s).strip() for s in (claims.get("skills") or []) if str(s).strip()]

    experience: list[WorkExperience] = []
    for p in claims.get("positions") or []:
        if not isinstance(p, dict):
            continue
        title = str(p.get("title", "")).strip()
        company = str(p.get("company", "")).strip()
        if not (title or company):
            continue
        experience.append(WorkExperience(
            company=company, title=title,
            start=str(p.get("start", "")).strip() or None,
            end=str(p.get("end", "")).strip() or None,
            summary=str(p.get("summary", "")).strip(),
            highlights=[str(h).strip() for h in (p.get("highlights") or []) if str(h).strip()],
        ))

    education: list[Education] = []
    for e in claims.get("educations") or []:
        if not isinstance(e, dict):
            continue
        inst = str(e.get("institution", "")).strip()
        if not inst:
            continue
        year = e.get("graduation_year")
        education.append(Education(
            institution=inst, degree=str(e.get("degree", "")).strip(),
            field_of_study=str(e.get("field_of_study", "")).strip(),
            graduation_year=int(year) if isinstance(year, int) else None,
        ))

    return UserProfile(
        user_id=user_id, headline=headline, summary=summary, skills=skills,
        work_experience=experience, education=education, preferences=JobPreferences(),
    )


# --- export parsing (Tier C) ------------------------------------------------
_SECTION_ALIASES = {
    "summary": "summary", "about": "summary",
    "experience": "experience", "work experience": "experience", "employment": "experience",
    "skills": "skills", "top skills": "skills",
    "education": "education",
}
_DATE_RE = re.compile(r"\b(19|20)\d{2}\b|present|current", re.IGNORECASE)


def _split_sections(text: str) -> dict[str, list[str]]:
    """Split into sections, preserving blank lines *inside* a section (they
    delimit individual experience/education entries)."""
    sections: dict[str, list[str]] = {}
    current: Optional[str] = None
    for raw in text.splitlines():
        line = raw.strip()
        key = _SECTION_ALIASES.get(line.lower().rstrip(":"))
        if key and len(line) <= 30:
            current = key
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)  # keep '' — it separates entries
    return sections


def _parse_skills(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        parts = re.split(r"[,•|]", line) if ("," in line or "•" in line or "|" in line) else [line]
        for p in parts:
            s = p.strip()
            if s and s not in out:
                out.append(s)
    return out


# Title/company on one line: "Title at Company", "Title, Company", "Title — Company".
_TITLE_COMPANY_RE = re.compile(r"\s+at\s+|,\s*|\s+[—–\-·|]\s+")


def _chunks(lines: list[str]) -> list[list[str]]:
    """Split a section into entries on blank lines (the export's delimiter)."""
    chunks: list[list[str]] = []
    cur: list[str] = []
    for line in lines:
        if not line.strip():
            if cur:
                chunks.append(cur)
                cur = []
            continue
        cur.append(line.strip())
    if cur:
        chunks.append(cur)
    return chunks


def _parse_experience(lines: list[str]) -> list[WorkExperience]:
    out: list[WorkExperience] = []
    for chunk in _chunks(lines):
        if not chunk:
            continue
        title, company = chunk[0], ""
        m = _TITLE_COMPANY_RE.split(chunk[0], maxsplit=1)
        if len(m) == 2 and m[1].strip():
            title, company = m[0].strip(), m[1].strip()
        elif len(chunk) >= 2 and not _DATE_RE.search(chunk[1]):
            company = chunk[1].strip()
        start = end = None
        desc: list[str] = []
        for line in chunk[1:]:
            if line.strip() == company:
                continue
            if _DATE_RE.search(line) and len(line) <= 40:
                full = re.findall(r"\b(?:19|20)\d{2}\b", line)
                if full:
                    start = full[0]
                    end = full[1] if len(full) > 1 else ("present" if re.search(r"present|current", line, re.I) else None)
                continue
            desc.append(line.strip())
        out.append(WorkExperience(
            company=company, title=title.strip(), start=start, end=end,
            summary=" ".join(desc).strip(), highlights=[],
        ))
    return out


def _parse_education(lines: list[str]) -> list[Education]:
    out: list[Education] = []
    for chunk in _chunks(lines):
        if not chunk:
            continue
        inst = chunk[0].strip()
        degree = field = ""
        year = None
        rest = " ".join(chunk[1:])
        ym = re.search(r"\b((?:19|20)\d{2})\b", rest)
        if ym:
            year = int(ym.group(1))
        dm = re.split(r"\s+(?:—|-|,)\s+", rest, maxsplit=1)
        if dm and dm[0]:
            degree = re.sub(r"\b(?:19|20)\d{2}\b", "", dm[0]).strip(" ,—-")
        if len(dm) > 1:
            field = re.sub(r"\b(?:19|20)\d{2}\b", "", dm[1]).strip(" ,—-")
        out.append(Education(institution=inst, degree=degree, field_of_study=field, graduation_year=year))
    return out


def parse_export_text(user_id: str, text: str) -> UserProfile:
    """Best-effort parse of an exported LinkedIn profile / résumé into a draft."""
    sections = _split_sections(text or "")
    return UserProfile(
        user_id=user_id,
        headline="",
        summary=" ".join(s for s in sections.get("summary", []) if s).strip(),
        skills=_parse_skills(sections.get("skills", [])),
        work_experience=_parse_experience(sections.get("experience", [])),
        education=_parse_education(sections.get("education", [])),
        preferences=JobPreferences(),
    )
