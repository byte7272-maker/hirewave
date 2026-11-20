"""Safety guard for the assistant's open-web research.

Web research fetches pages the user didn't choose by hand, so every URL the app
would fetch — and every query it would run — passes these checks first. The rules
enforce, server-side (so no client can bypass them):

* HTTPS only — no ``http://`` or any other scheme (no insecure connections).
* No IP-literal hosts — a hostname that is a raw IPv4/IPv6 address is rejected
  (public or private), which also closes off SSRF to internal addresses.
* No credentials in the URL, and only the default HTTPS port.
* No file downloads — executables, archives, disk images, installers, torrents,
  and office/PDF documents are refused; research reads web *pages*, not downloads.
* No adult or torrent/piracy destinations — blocked by host and by query terms.

Legitimate app traffic (the backend API, the configured search provider, job
boards the extension is authorized for) does not flow through here; this guard is
only for the open-web *research* fetch/search path.

Pure functions, no I/O, so they are fast and fully testable.
"""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

#: File extensions we never fetch as research — downloads, not readable pages.
_BLOCKED_EXT = (
    # executables / installers
    ".exe", ".msi", ".apk", ".dmg", ".pkg", ".bin", ".scr", ".bat", ".cmd", ".com",
    ".jar", ".app", ".deb", ".rpm", ".appimage",
    # archives / disk images
    ".zip", ".rar", ".7z", ".gz", ".tar", ".tgz", ".bz2", ".xz", ".iso", ".img",
    # torrents
    ".torrent",
    # documents (download, not a web page)
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf", ".epub", ".csv",
)

#: Host/label substrings that mark an adult or torrent/piracy destination. Matched
#: against the dot-separated hostname labels (so "sex" matches "sex.example.com" but
#: not "essex.com"), plus a few multi-word brands matched on the whole host.
_BLOCKED_HOST_LABELS = frozenset({
    # adult
    "porn", "porno", "xxx", "sex", "nsfw", "camgirl", "camgirls", "escort", "escorts",
    "hentai", "nude", "nudes", "fetish", "onlyfans", "brazzers", "xvideos", "pornhub",
    "xhamster", "redtube", "youporn", "chaturbate", "stripchat",
    # torrent / piracy / warez
    "torrent", "torrents", "piratebay", "thepiratebay", "1337x", "rarbg", "yts",
    "nyaa", "kickass", "kickasstorrents", "limetorrents", "torrentz", "warez",
    "crack", "cracked", "keygen", "nulled",
})
#: Whole-host brand matches (contain a dot, so they can't be single labels).
_BLOCKED_HOST_PATTERNS = (
    re.compile(r"\bthepiratebay\b", re.I),
    re.compile(r"\b1337x\b", re.I),
)

#: Query terms that mark an adult or torrent/piracy search. Word-boundary matched.
_BLOCKED_QUERY_RE = re.compile(
    r"\b("
    r"porn\w*|pornography|xxx|nsfw|hentai|nudes?|camgirls?|escort\w*|fetish|"
    r"onlyfans|sexcam\w*|"
    r"torrent\w*|magnet\s*link|piratebay|the\s*pirate\s*bay|1337x|rarbg|yts\b|"
    r"kickass|limetorrent\w*|warez|keygen|nulled|"
    r"crack(ed|s)?\s+(download|software|game|full\s*version)|"
    r"free\s+download\s+(movie|film|episode|season|album|crack|keygen|software)"
    r")\b",
    re.I,
)


def is_blocked_query(query: str) -> tuple[bool, str]:
    """True + reason when a research query targets adult or torrent/piracy content.
    Safe queries return (False, "")."""
    q = (query or "").strip()
    if not q:
        return True, "empty query"
    m = _BLOCKED_QUERY_RE.search(q)
    if m:
        return True, f"blocked search term: {m.group(0).strip().lower()!r}"
    return False, ""


def _host_is_blocked(host: str) -> bool:
    host = (host or "").lower()
    if any(p.search(host) for p in _BLOCKED_HOST_PATTERNS):
        return True
    return any(label in _BLOCKED_HOST_LABELS for label in host.split("."))


def is_safe_research_url(url: str) -> tuple[bool, str]:
    """Whether an open-web research URL is safe to fetch. Returns (ok, reason); reason
    is the refusal cause when ok is False (for honest narration + logging)."""
    raw = (url or "").strip()
    if not raw:
        return False, "empty URL"
    try:
        parts = urlsplit(raw)
    except ValueError:
        return False, "malformed URL"

    # HTTPS only — reject http:// and every other scheme (no insecure connections).
    if parts.scheme.lower() != "https":
        return False, f"insecure or unsupported scheme: {parts.scheme or '(none)'!r} (https only)"

    host = parts.hostname or ""
    if not host:
        return False, "no host"
    # No credentials embedded in the URL.
    if parts.username or parts.password:
        return False, "credentials in URL"
    # Only the default HTTPS port.
    try:
        if parts.port is not None and parts.port != 443:
            return False, f"non-standard port: {parts.port}"
    except ValueError:
        return False, "invalid port"

    # Reject a raw IP-literal host (IPv4 or IPv6), public or private — also blocks SSRF
    # to internal addresses. A real research source is a named host.
    bare = host[1:-1] if host.startswith("[") and host.endswith("]") else host
    try:
        ipaddress.ip_address(bare)
        return False, "IP-address host not allowed (use a named domain)"
    except ValueError:
        pass  # not an IP literal — expected for a normal hostname

    if _host_is_blocked(host):
        return False, "blocked destination (adult or torrent/piracy host)"

    # No file downloads — research reads pages, not files.
    path = (parts.path or "").lower()
    if path.endswith(_BLOCKED_EXT):
        return False, "file download not allowed (research reads web pages only)"

    return True, ""


def filter_sources(sources: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split fetched research sources into (kept, rejected). Each rejected entry gets a
    ``_rejected`` reason so the caller can narrate what was skipped and why."""
    kept, rejected = [], []
    for src in sources or []:
        if not isinstance(src, dict):
            continue
        ok, reason = is_safe_research_url(str(src.get("url", "")))
        if ok:
            kept.append(src)
        else:
            rejected.append({**src, "_rejected": reason})
    return kept, rejected


def safe_queries(queries: list[str]) -> list[str]:
    """Drop any research queries that target adult or torrent/piracy content."""
    return [q for q in (queries or []) if not is_blocked_query(q)[0]]
