"""Auto form-fill — map the user's *factual* profile data onto an application
form, review-first.

Hard rules (never relaxed):

* **Never fill credential fields.** Passwords, SSN, card/bank numbers, passport,
  etc. are detected and left blank with ``blocked`` status — the user
  authenticates directly with the provider; this app never captures those.
* **Never fabricate.** A field we can't source from the profile is left blank
  and flagged ``needs_input`` — the user fills it in.
* The output is a *plan* the user reviews before anything is submitted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from jobsearch.models import User, UserProfile

_CREDENTIAL = re.compile(
    r"password|passphrase|\bpin\b|ssn|social security|national id|tax id|passport|"
    # A driver's-license *number/id* is a credential; a yes/no 'do you have a
    # license?' is a screener question (handled by the screener memory), so only
    # block when it's clearly asking for the number/id.
    r"driver'?s? licen[sc]e\s*(?:number|no\b|#|id\b)|"
    r"credit card|card number|\bcvv\b|\bcvc\b|routing|bank account|"
    r"account number|security code|mother'?s maiden",
    re.IGNORECASE,
)


@dataclass
class FormField:
    name: str
    label: str = ""
    type: str = "text"  # text|email|tel|url|textarea|file|password|number|select|checkbox
    required: bool = False


@dataclass
class FillEntry:
    field: str
    label: str
    value: str
    source: str  # "account" | "profile" | "generated" | ""
    status: str  # "filled" | "blocked" | "needs_input"
    reason: str = ""


@dataclass
class FillPlan:
    entries: list[FillEntry] = field(default_factory=list)

    @property
    def filled(self) -> int:
        return sum(1 for e in self.entries if e.status == "filled")

    @property
    def blocked(self) -> int:
        return sum(1 for e in self.entries if e.status == "blocked")

    @property
    def needs_input(self) -> int:
        return sum(1 for e in self.entries if e.status == "needs_input")


def _first(name: str) -> str:
    parts = (name or "").split()
    return parts[0] if parts else ""


def _last(name: str) -> str:
    parts = (name or "").split()
    return " ".join(parts[1:]) if len(parts) > 1 else ""


class FormFillEngine:
    """Produce a reviewable fill plan for a form from the user's own data."""

    def plan(
        self,
        user: User,
        profile: UserProfile,
        fields: list[FormField],
        *,
        resume_name: str = "",
        cover_text: str = "",
        screener_suggest: Optional[Callable[[str], Optional[dict]]] = None,
    ) -> FillPlan:
        prefs = profile.preferences
        location = user.location or (prefs.target_locations[0] if prefs.target_locations else "")
        sr = prefs.salary_range
        salary = ""
        if sr and (sr.minimum or sr.maximum):
            lo, hi = sr.minimum, sr.maximum
            salary = f"{sr.currency} {lo or ''}{'-' if lo and hi else ''}{hi or ''}".strip()

        plan = FillPlan()
        for f in fields:
            key = f"{f.name} {f.label}".lower()

            # 1. Credentials — refuse outright, never store a value.
            if f.type == "password" or _CREDENTIAL.search(key):
                plan.entries.append(FillEntry(
                    field=f.name, label=f.label or f.name, value="", source="", status="blocked",
                    reason="Credential field — you authenticate directly with the provider; this app never fills it.",
                ))
                continue

            value, source = self._resolve(key, f, user, profile, location, salary, resume_name, cover_text)
            if value:
                plan.entries.append(FillEntry(field=f.name, label=f.label or f.name, value=value, source=source, status="filled"))
                continue

            # Not in the profile — try the learned screener-answer memory (a prior
            # application's answer to this same question). Reviewed before submit.
            hit = screener_suggest(f.label or f.name) if screener_suggest else None
            if hit and hit.get("answer"):
                plan.entries.append(FillEntry(
                    field=f.name, label=f.label or f.name, value=str(hit["answer"]),
                    source="screener", status="filled",
                    reason=f"From your saved answers (matched \"{hit.get('matched_question', '')}\", "
                           f"{int(hit.get('confidence', 0) * 100)}% match) — check it's right.",
                ))
                continue

            plan.entries.append(FillEntry(
                field=f.name, label=f.label or f.name, value="", source="", status="needs_input",
                reason="Not in your profile — fill this in yourself (we don't guess).",
            ))
        return plan

    def _resolve(self, key, f, user, profile, location, salary, resume_name, cover_text) -> tuple[str, str]:
        def has(*words: str) -> bool:
            return any(w in key for w in words)

        if has("first name", "given name"):
            return _first(user.full_name), "account"
        if has("last name", "surname", "family name"):
            return _last(user.full_name), "account"
        if has("full name") or re.search(r"\bname\b", key):
            return user.full_name, "account"
        if has("email", "e-mail"):
            return user.email, "account"
        if has("phone", "mobile", "telephone"):
            return user.phone, "account"
        if has("linkedin", "github", "portfolio", "website", "personal url"):
            return "", ""  # not stored — needs_input, never invented
        if has("city", "town", "location", "address", "based"):
            return location, "profile"
        if has("skill", "technolog", "tools"):
            return ", ".join(profile.skills), "profile"
        if has("headline", "current title", "job title"):
            return profile.headline, "profile"
        if has("salary", "compensation", "pay expect", "desired pay"):
            return salary, "profile"
        if f.type == "file" or has("resume", "cv", "curriculum"):
            return (resume_name, "generated") if resume_name else ("", "")
        if has("cover letter", "why ", "tell us", "message", "anything else", "additional info", "motivation"):
            return (cover_text[:1500], "generated") if cover_text else ("", "")
        if has("summary", "about you", "bio"):
            return profile.summary, "profile"
        # Deliberately NOT auto-answered (never assume): years of experience,
        # work authorization / visa / sponsorship, custom yes/no questions.
        return "", ""
