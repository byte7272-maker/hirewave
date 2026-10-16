"""Classify an email as job-related — so a connected account can be scanned for ONLY
job email. That filter is the privacy guarantee: non-job mail is never read into the
app, and (for a dedicated job account) nothing personal is there to begin with.

Provider-agnostic: the same classifier runs on mail from a connected Gmail (OAuth,
``gmail_fetch``), a dedicated IMAP job account (``imap_source``), or a forwarded
``.eml`` (``email_import``). Deterministic signals only — sender domains (job boards +
ATS/recruiting platforms) and subject/body keywords — so it is fast, offline, and leaks
nothing to an LLM.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from email import message_from_string
from email.header import decode_header, make_header
from email.utils import parseaddr

# Senders that are inherently job-related. Boards/alerts first, then the ATS and
# recruiting platforms that send application confirmations, interview invites, etc.
_JOB_SENDER_DOMAINS = {
    # boards / alerts
    "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com",
    "dice.com", "wellfound.com", "builtin.com", "hired.com", "otta.com", "angellist.com",
    # ATS / recruiting platforms
    "greenhouse.io", "greenhouse-mail.io", "us.greenhouse-mail.io", "lever.co", "hire.lever.co",
    "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com", "ashbyhq.com",
    "jobvite.com", "bamboohr.com", "taleo.net", "successfactors.com", "breezy.hr",
    "workable.com", "recruitee.com", "teamtailor.com", "paylocity.com",
    # interview scheduling
    "calendly.com", "goodtime.io", "modernloop.io",
}

# Keyword signals per email KIND (checked against subject + body, lower-cased).
# Order matters a little: a rejection phrase outranks a generic "interview" mention.
_KIND_SIGNALS: list[tuple[str, tuple[str, ...]]] = [
    ("rejection", (
        "unfortunately", "not moving forward", "decided not to proceed", "other candidates",
        "will not be moving forward", "position has been filled", "no longer under consideration",
        "not selected", "decided to move forward with other", "pursue other candidates",
        "we won't be", "regret to inform",
    )),
    ("offer", (
        "offer letter", "job offer", "we're excited to offer", "we are excited to offer",
        "pleased to offer", "extend an offer", "your offer",
    )),
    ("interview", (
        "schedule a call", "phone screen", "technical screen", "invitation to interview",
        "set up an interview", "availability for a", "book a time", "onsite interview",
        "next round", "video interview", "meet with the team", "schedule your interview",
    )),
    ("application", (
        "application received", "thank you for applying", "we received your application",
        "your application has been received", "application submitted", "thanks for applying",
        "your application to", "application confirmation", "received your application",
        "successfully applied",
    )),
    ("alert", (
        "new jobs for you", "jobs for you", "job alert", "recommended jobs", "new job matches",
        "jobs matching", "new jobs matching", "top jobs", "jobs you may be interested",
    )),
    ("recruiter", (
        "came across your profile", "reaching out about", "opportunity at", "role at",
        "interested in your background", "would be a great fit", "your experience in",
        "exciting opportunity", "open role", "we're hiring", "connect about a role",
        "recruiter", "talent acquisition", "sourcing for",
    )),
]
_ALL_KINDS = ("alert", "application", "interview", "offer", "rejection", "recruiter")
# A job email's KIND maps to a tracker-friendly status for one-way processing.
_KIND_STATUS = {
    "alert": "new", "application": "applied", "interview": "interviewing",
    "offer": "offered", "rejection": "rejected", "recruiter": "lead",
}
# Pull the role/title the email is about, when stated plainly. Conservative — empty
# rather than a wrong guess.
# Use "for <role>" / "role of <role>" forms (not "to <company>", which names the company).
_ROLE_RE = re.compile(
    r"(?:application for|applied for|applying for|the role of|position of|role of|"
    r"for the (?:position|role) of)\s+"
    r"(?:the\s+)?([A-Z][A-Za-z0-9/&+ -]{2,44}?)"
    r"(?=[.,;—]|\s+(?:at|role|position|opening|opportunity|with|\()|$)"
)
_ROLE_AT_RE = re.compile(
    r"\b([A-Z][A-Za-z0-9/&+ -]{2,44}?)\s+(?:role|position|opportunity)\s+at\b"
)
# A URL that looks like a real posting/application link.
_URL_RE = re.compile(r"https?://[^\s)>\]\"']+")
_JOB_URLISH = re.compile(
    r"(/jobs?/|/viewjob|/careers?/|/apply|/applications?/|greenhouse|lever|workday|icims|"
    r"ashby|smartrecruiters|[?&]jk=|/job-listing)", re.I,
)
# Generic hiring words that lend weak support when the sender isn't a known job domain.
_WEAK_JOB_HINTS = re.compile(
    r"\b(job|role|position|hiring|recruit\w*|candidate|applicant|career|interview|resume|r[eé]sum[eé])\b",
    re.I,
)


@dataclass
class JobEmail:
    """A classified email. ``is_job`` is the privacy gate — only these are surfaced."""

    is_job: bool
    kind: str          # alert | application | interview | offer | rejection | recruiter | other
    confidence: float  # 0..1
    sender: str = ""
    sender_domain: str = ""
    subject: str = ""
    company: str = ""
    role: str = ""     # the job title the email is about, when stated
    link: str = ""     # a posting/application URL, when present
    status: str = ""   # tracker-friendly: new|applied|interviewing|offered|rejected|lead


def _domain_of(address: str) -> str:
    """The lower-cased domain of an email address ('a@x.co' -> 'x.co'); '' if none."""
    _, addr = parseaddr(address or "")
    _, _, dom = addr.partition("@")
    return dom.strip().lower()


def _is_job_sender(domain: str) -> bool:
    """True when the sender domain IS, or is a subdomain of, a known job/ATS domain
    (so 'jobs.company.greenhouse.io' and 'company.workday.com' both match)."""
    if not domain:
        return False
    for known in _JOB_SENDER_DOMAINS:
        if domain == known or domain.endswith("." + known):
            return True
    return False


def _company_from(sender_domain: str, subject: str) -> str:
    """Best-effort company name. For an ATS domain like 'acme.greenhouse.io' or
    'acme.workday.com', the left-most label is usually the company; otherwise pull a
    name out of 'your application to <Company>' / 'opportunity at <Company>'."""
    m = re.search(
        r"(?:application to|opportunity at|role at|interview with|from)\s+([A-Z][\w.& ]{1,40})",
        subject or "",
    )
    if m:
        return m.group(1).strip().rstrip(".,!")
    parts = (sender_domain or "").split(".")
    if len(parts) >= 3 and _is_job_sender(sender_domain) and parts[0] not in {"www", "mail", "jobs", "no-reply", "noreply", "us", "careers", "hire"}:
        return parts[0].replace("-", " ").title()
    return ""


def _extract_role(subject: str, body: str) -> str:
    """The job title the email is about, when stated plainly; '' otherwise."""
    for text in (subject or "", body or ""):
        for rx in (_ROLE_RE, _ROLE_AT_RE):
            m = rx.search(text)
            if m:
                role = m.group(1).strip().rstrip(" .,-")
                low = role.lower()
                if 3 <= len(role) <= 45 and not low.startswith(("your", "our", "the ", "a ", "an ")):
                    return role
    return ""


def _extract_link(subject: str, body: str) -> str:
    """The first posting/application-looking URL in the email; '' otherwise."""
    for url in _URL_RE.findall(f"{subject or ''} {body or ''}"):
        if _JOB_URLISH.search(url):
            return url.rstrip(".,)")
    return ""


def classify_job_email(sender: str, subject: str, body: str = "") -> JobEmail:
    """Decide whether an email is job-related and of what KIND, with a confidence.

    A message counts as job email when it comes from a known job/ATS sender, OR its
    subject/body carries clear job-search signals. Everything else is ``is_job=False``
    and is never surfaced (the privacy gate)."""
    domain = _domain_of(sender)
    hay = f"{subject or ''}\n{body or ''}".lower()
    job_sender = _is_job_sender(domain)

    # Score each kind by how many of its signal phrases appear.
    best_kind, best_hits = "", 0
    for kind, phrases in _KIND_SIGNALS:
        hits = sum(1 for p in phrases if p in hay)
        if hits > best_hits:
            best_kind, best_hits = kind, hits

    weak = bool(_WEAK_JOB_HINTS.search(hay))
    # is_job: a job/ATS sender is enough on its own; otherwise we need real keyword
    # signals (a single weak hint like the word "career" is NOT enough -> privacy).
    is_job = job_sender or best_hits >= 1
    if not is_job:
        return JobEmail(False, "other", 0.0, sender, domain, subject or "")

    kind = best_kind or ("alert" if job_sender else "other")
    # Confidence: sender match is the strongest signal; keyword hits add to it.
    confidence = 0.0
    if job_sender:
        confidence += 0.6
    confidence += min(0.4, 0.2 * best_hits)
    if weak:
        confidence += 0.05
    confidence = round(min(1.0, confidence), 2)

    return JobEmail(
        is_job=True,
        kind=kind,
        confidence=confidence,
        sender=sender or "",
        sender_domain=domain,
        subject=subject or "",
        company=_company_from(domain, subject or ""),
        role=_extract_role(subject or "", body or ""),
        link=_extract_link(subject or "", body or ""),
        status=_KIND_STATUS.get(kind, ""),
    )


def scan_job_emails(emails: list[dict]) -> list[JobEmail]:
    """Run a batch of raw emails (each ``{sender/from, subject, body/text}``) through the
    classifier and return ONLY the job-related ones (the privacy filter), newest-first
    order preserved. Keys are read leniently so any source's shape works."""
    out: list[JobEmail] = []
    for e in emails or []:
        sender = e.get("sender") or e.get("from") or e.get("From") or ""
        subject = e.get("subject") or e.get("Subject") or ""
        body = e.get("body") or e.get("text") or e.get("snippet") or ""
        res = classify_job_email(sender, subject, body)
        if res.is_job:
            out.append(res)
    return out


_TAG_RE = re.compile(r"<[^>]+>")


def _decode(value: str) -> str:
    """Decode an RFC 2047 header (=?utf-8?..?=) to plain text; never raises."""
    try:
        return str(make_header(decode_header(value or "")))
    except Exception:  # noqa: BLE001 - best-effort header decode
        return value or ""


def raw_to_fields(raw: str) -> dict:
    """Parse a raw RFC 822 email string into ``{sender, subject, body}`` for the
    classifier. Prefers the text/plain part; falls back to tag-stripped HTML."""
    msg = message_from_string(raw or "")
    sender = _decode(msg.get("From", ""))
    subject = _decode(msg.get("Subject", ""))
    text, html = "", ""
    for part in (msg.walk() if msg.is_multipart() else [msg]):
        ctype = (part.get_content_type() or "").lower()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            payload = part.get_payload(decode=True)
            chunk = payload.decode(part.get_content_charset() or "utf-8", "replace") if payload else ""
        except Exception:  # noqa: BLE001 - undecodable part
            chunk = ""
        if ctype == "text/plain" and not text:
            text = chunk
        elif ctype == "text/html" and not html:
            html = chunk
    body = text or _TAG_RE.sub(" ", html)
    return {"sender": sender, "subject": subject, "body": body}


def classify_raw_emails(raws: list[str]) -> list[JobEmail]:
    """Classify a batch of RAW email strings (as a Gmail/IMAP source returns them),
    returning only the job-related ones."""
    return scan_job_emails([raw_to_fields(r) for r in (raws or [])])
