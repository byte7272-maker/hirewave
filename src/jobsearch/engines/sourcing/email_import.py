"""Parse a forwarded/uploaded job-alert email into postings.

Consent-based: the user brings their *own* job-alert email (LinkedIn, Indeed,
Glassdoor, …) as a ``.eml`` file or raw text; we extract the roles it lists and
hand them to the aggregator's ingest pipeline. Uses only the standard library
(``email`` + ``html.parser``) — best-effort, degrading to (title, url) when the
company/location can't be recovered.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from email import message_from_bytes, message_from_string
from email.utils import parseaddr
from html.parser import HTMLParser
from html import unescape

# hrefs that look like a real job posting …
_JOB_URL = re.compile(r"(/jobs?/view|/viewjob|/job-listing|/jobs?/|/careers?/|[?&]jk=|/rc/clk|/comm/jobs|/partner/joblisting)", re.I)
# … and ones that are clearly not.
_NON_JOB = re.compile(r"(unsubscribe|/help|/settings|/login|/account|optout|mailto:|/feed|notification|/privacy|/legal)", re.I)
_CTA = {
    "view job", "view jobs", "see all", "see all jobs", "apply", "apply now", "view",
    "see more", "update", "settings", "help", "sign in", "easy apply", "save job",
    "view all jobs", "unsubscribe", "manage alerts", "see jobs", "view details",
}
_SPLIT = re.compile(r"\s*[·•|–—]\s*|\s+[-]\s+|\s+ in \s+|\s+ at \s+", re.I)
_BOARDS = {
    "linkedin.com": "linkedin", "indeed.com": "indeed", "glassdoor.com": "glassdoor",
    "ziprecruiter.com": "ziprecruiter", "monster.com": "monster", "dice.com": "dice",
    "wellfound.com": "wellfound", "lever.co": "lever", "greenhouse.io": "greenhouse",
}


@dataclass
class ParsedAlert:
    source: str = "email"
    postings: list[dict] = field(default_factory=list)
    sender: str = ""
    subject: str = ""


class _Stream(HTMLParser):
    """Collects an ordered stream of text tokens and anchors so a job title's
    company/location (which follow it) can be recovered."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[tuple] = []  # ("text", str) | ("link", href, text)
        self._href: str | None = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href", "")
            self._buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.tokens.append(("link", self._href, " ".join(self._buf).strip()))
            self._href = None
            self._buf = []

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        if self._href is not None:
            self._buf.append(text)
        else:
            self.tokens.append(("text", text))


def _source_from(sender: str) -> str:
    _, addr = parseaddr(sender or "")
    domain = addr.split("@")[-1].lower()
    for host, name in _BOARDS.items():
        if host in domain:
            return name
    parts = [p for p in domain.split(".") if p not in ("com", "net", "org", "io", "co", "www", "email", "notify", "e", "mail", "jobs")]
    return parts[-1] if parts else "email"


def _external_id(url: str, source: str) -> str:
    m = re.search(r"[?&](?:jk|currentJobId|jobId)=([\w-]+)", url)
    if m:
        return f"{source}-{m.group(1)}"
    seg = [s for s in re.split(r"[/?#]", url) if s and not s.startswith("http")]
    tail = next((s for s in reversed(seg) if re.search(r"\d", s)), seg[-1] if seg else "")
    return f"{source}-{tail[:40]}" if tail else ""


def _is_title(text: str) -> bool:
    t = text.strip()
    return 3 <= len(t) <= 140 and bool(re.search(r"[A-Za-z]", t)) and t.lower() not in _CTA


def _postings_from_tokens(tokens: list[tuple], source: str) -> list[dict]:
    out: list[dict] = []
    seen_urls: set[str] = set()
    for i, tok in enumerate(tokens):
        if tok[0] != "link":
            continue
        href, text = tok[1], unescape(tok[2])
        if not href or _NON_JOB.search(href) or not _JOB_URL.search(href):
            continue
        if not _is_title(text) or href in seen_urls:
            continue
        seen_urls.add(href)
        company, location = "", ""
        # the next couple of text tokens usually carry "Company · Location"
        for nxt in tokens[i + 1 : i + 4]:
            if nxt[0] == "text" and nxt[1].lower() not in _CTA and _JOB_URL.search(nxt[1]) is None:
                parts = _SPLIT.split(unescape(nxt[1]), maxsplit=1)
                company = parts[0].strip()
                location = parts[1].strip() if len(parts) > 1 else ""
                break
        out.append({
            "source_platform": source,
            "external_id": _external_id(href, source),
            "title": text.strip(),
            "company": company,
            "location": location,
            "remote": "remote" in (text + " " + location).lower(),
            "url": href,
            "description": f"{text.strip()} — imported from a {source} job alert.",
            "requirements": [],
        })
    return out


def _bodies(msg) -> tuple[str, str]:
    html_body, text_body = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype not in ("text/html", "text/plain"):
                continue
            try:
                payload = part.get_payload(decode=True)
                content = payload.decode(part.get_content_charset() or "utf-8", "replace") if payload else ""
            except (LookupError, ValueError):
                content = ""
            if ctype == "text/html":
                html_body += content
            else:
                text_body += content
    else:
        payload = msg.get_payload(decode=True)
        content = payload.decode(msg.get_content_charset() or "utf-8", "replace") if payload else str(msg.get_payload())
        if msg.get_content_type() == "text/html":
            html_body = content
        else:
            text_body = content
    return html_body, text_body


def parse_job_alert(raw: bytes | str) -> ParsedAlert:
    """Parse a ``.eml`` (bytes) or raw email/HTML text into job postings."""
    if isinstance(raw, bytes):
        msg = message_from_bytes(raw)
    else:
        msg = message_from_string(raw)

    source = _source_from(msg.get("From", ""))
    html_body, text_body = _bodies(msg)
    # Parse the HTML part; fall back to the plain part (a non-MIME blob or a
    # text/plain part can still contain the alert's HTML/links).
    body = html_body or text_body

    postings: list[dict] = []
    if body:
        parser = _Stream()
        try:
            parser.feed(body)
        except Exception:  # noqa: BLE001 - never let malformed HTML break import
            pass
        postings = _postings_from_tokens(parser.tokens, source)

    return ParsedAlert(
        source=source,
        postings=postings,
        sender=unescape(msg.get("From", "")),
        subject=unescape(msg.get("Subject", "")),
    )
