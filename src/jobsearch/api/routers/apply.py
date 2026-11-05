"""Apply field-mapping — the backend the browser extension calls to fill a live
application form in the user's own, already-authenticated tab.

The extension reads the **visible fields** of the application form the user opened and
POSTs them here. This returns a ``{field -> value}`` plan built from the user's own
profile/résumé. The extension fills those values into the live inputs; the user reviews
and submits. No Playwright, no stored cookies, no credentials.

Safety is the whole point:
  * **Credential / sensitive fields are never mapped** — password, SSN, card, bank,
    government id, DOB, security questions. They're returned in ``skipped_sensitive`` so
    the UI can show "you fill this".
  * **Legal attestations** (work authorization, sponsorship, veteran/disability) are left
    **unmapped** — the user answers those themselves; the app never attests on their behalf.
  * Deterministic mapping handles the common, unambiguous fields with **no LLM cost**;
    Claude is used only for the leftover fields, and its output is re-filtered through the
    same sensitive guard (it can never cause a credential to be filled).
This endpoint performs **no** action on any page — it only returns a plan.
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from jobsearch.api.deps import CurrentUser, StateDep

router = APIRouter(prefix="/api/v1/apply", tags=["apply"])

_MAX_FIELDS = 120

# Fields we must NEVER auto-fill — credentials / financial / government identity.
_SENSITIVE = re.compile(
    r"(password|passwd|\bssn\b|social.?security|card.?number|credit.?card|\bcvv\b|\bcvc\b|"
    r"routing|account.?number|\bbank\b|passport|driver.?s?.?licen|national.?id|government.?id|"
    r"date.?of.?birth|\bdob\b|security.?question|security.?answer|\bpin\b)",
    re.I,
)
# Legal attestations the USER must answer — never auto-answered on their behalf.
_ATTESTATION = re.compile(
    r"(authoriz|sponsor|visa|eligible.?to.?work|work.?authoriz|veteran|disab|"
    r"felony|conviction|background.?check|gender|race|ethnic|hispanic|consent|agree|certify)",
    re.I,
)


class FormField(BaseModel):
    name: str = ""              # input name/id attribute
    label: str = ""            # the visible label text
    type: str = "text"         # text | email | tel | textarea | select | checkbox | radio | file | ...
    options: list[str] = Field(default_factory=list)   # for select/radio
    required: bool = False


class FieldMapRequest(BaseModel):
    job_id: str = ""
    resume_id: str = ""
    fields: list[FormField] = Field(default_factory=list)


def _field_key(f: FormField) -> str:
    return (f.name or f.label or f.type or "field").strip()


def _candidate(state, user) -> dict:
    """The user's own factual data the mapper may draw from (never credentials)."""
    full = None
    try:
        full = state.users.get(user.id)
    except Exception:  # noqa: BLE001
        full = None
    name = (getattr(full, "full_name", "") or getattr(user, "full_name", "") or "").strip()
    email = (getattr(full, "email", "") or getattr(user, "email", "") or "").strip()
    prof = None
    try:
        prof = state.profiles.get(user.id)
    except Exception:  # noqa: BLE001
        prof = None
    headline = getattr(prof, "headline", "") if prof else ""
    summary = getattr(prof, "summary", "") if prof else ""
    skills = getattr(prof, "skills", []) if prof else []
    we = (prof.work_experience[0] if prof and getattr(prof, "work_experience", None) else None)
    edu = (prof.education[0] if prof and getattr(prof, "education", None) else None)
    parts = name.split()
    return {
        "full_name": name,
        "first_name": parts[0] if parts else "",
        "last_name": " ".join(parts[1:]) if len(parts) > 1 else "",
        "email": email,
        "current_title": (getattr(we, "title", "") if we else "") or headline,
        "current_company": getattr(we, "company", "") if we else "",
        "skills": ", ".join(skills) if skills else "",
        "school": getattr(edu, "institution", "") if edu else "",
        "degree": getattr(edu, "degree", "") if edu else "",
        "summary": summary,
    }


# label/name keyword -> candidate key (longest/most-specific first)
_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"first.?name|given.?name|\bfname\b", re.I), "first_name"),
    (re.compile(r"last.?name|surname|family.?name|\blname\b", re.I), "last_name"),
    (re.compile(r"full.?name|^name$|your.?name|applicant.?name", re.I), "full_name"),
    (re.compile(r"e.?mail", re.I), "email"),
    (re.compile(r"current.?(company|employer)|\bemployer\b", re.I), "current_company"),
    (re.compile(r"current.?(title|role|position)|job.?title|\bheadline\b|\btitle\b", re.I), "current_title"),
    (re.compile(r"\bskills?\b", re.I), "skills"),
    (re.compile(r"school|university|college|institution|alma", re.I), "school"),
    (re.compile(r"\bdegree\b|qualification", re.I), "degree"),
    (re.compile(r"cover.?letter|summary|about.?you|why.?(do|are|should)|motivation|tell.?us", re.I), "summary"),
]


def _guess(f: FormField, cand: dict) -> tuple[str, str] | None:
    """Deterministic map of one field to a candidate value, or None."""
    hay = f"{f.label} {f.name}".strip()
    if not hay:
        return None
    for pat, key in _RULES:
        if pat.search(hay):
            val = cand.get(key, "")
            if val:
                return val, "profile"
            return None  # matched but we have no value -> leave for the user
    return None


@router.post("/field-map")
def field_map(body: FieldMapRequest, user: CurrentUser, state: StateDep) -> dict:
    """Map a live application form's fields to the user's own data. Returns a fill plan;
    performs no action. Credentials and legal attestations are never mapped."""
    cand = _candidate(state, user)
    fields = body.fields[:_MAX_FIELDS]

    mappings: list[dict] = []
    unmapped: list[str] = []
    skipped_sensitive: list[str] = []
    needs_user: list[str] = []      # legal attestations the user must answer
    to_ai: list[FormField] = []

    for f in fields:
        key = _field_key(f)
        hay = f"{f.label} {f.name}"
        if _SENSITIVE.search(hay) or f.type == "password":
            skipped_sensitive.append(key)
            continue
        if _ATTESTATION.search(hay):
            needs_user.append(key)
            continue
        g = _guess(f, cand)
        if g is not None:
            mappings.append({"field": key, "value": g[0], "source": g[1], "confidence": 0.95})
        else:
            unmapped.append(key)
            to_ai.append(f)

    # Best-effort LLM pass for the leftover (non-sensitive) fields only. Defensive: any
    # parse/LLM failure just leaves them unmapped, and every suggestion is re-screened.
    ai_filled = _ai_map(state, user, to_ai, cand)
    for key, value in ai_filled.items():
        if key in unmapped and value and not _SENSITIVE.search(key):
            mappings.append({"field": key, "value": value, "source": "ai", "confidence": 0.6})
            unmapped.remove(key)

    return {
        "mappings": mappings,
        "unmapped": unmapped,
        "skipped_sensitive": skipped_sensitive,
        "needs_user": needs_user,
        "note": "Review before submitting. Credentials and legal/eligibility questions are never auto-filled.",
    }


def _ai_map(state, user, fields: list[FormField], cand: dict) -> dict:
    """Ask the LLM to map the remaining fields to the candidate data. Returns
    ``{field_key: value}``. Best-effort — returns {} on any problem."""
    if not fields:
        return {}
    try:
        llm = state.generation.llm
    except Exception:  # noqa: BLE001
        return {}
    labels = [{"field": _field_key(f), "label": f.label, "type": f.type,
               "options": f.options[:20]} for f in fields]
    data = {k: v for k, v in cand.items() if v}
    prompt = (
        "Map each form FIELD to the single best VALUE drawn ONLY from this applicant DATA. "
        "Never invent facts. Leave a field out entirely if no DATA value fits. Never output a "
        "password, financial, government-id, or legal-attestation value.\n\n"
        f"DATA = {json.dumps(data)}\n\nFIELDS = {json.dumps(labels)}\n\n"
        'Return ONLY a JSON array like [{"field": "<field>", "value": "<value>"}].'
    )
    try:
        out = llm.complete(prompt, system="You map résumé data onto job-application form fields. Output JSON only.")
        start, end = out.find("["), out.rfind("]")
        if start < 0 or end <= start:
            return {}
        arr = json.loads(out[start:end + 1])
        result: dict = {}
        for item in arr:
            if isinstance(item, dict) and item.get("field") and item.get("value"):
                result[str(item["field"])] = str(item["value"])
        return result
    except Exception:  # noqa: BLE001 - mock/garbled/unavailable LLM -> no AI fills
        return {}
