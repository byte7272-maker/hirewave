"""Pull a job's **full description** from its source page.

Email alerts and board digests give us a title, company and a link, but only a
one-line placeholder description — so matching, résumé-review and cover-letter
tailoring have nothing concrete to work with. This module fetches the posting's
own URL and extracts the real job description.

It is deliberately **provider-agnostic**: it reads schema.org ``JobPosting``
JSON-LD first (LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday and most ATS
boards all emit it), then falls back to the page's meta description. The parsing
is a pure function (``extract_jd_from_html``) so it is fully unit-tested without
the network; only ``fetch_jd`` touches the wire and it never raises.
"""

from __future__ import annotations

import html as _html
import json
import re
from typing import Optional

from jobsearch.engines.sourcing.skills import detect_category, enrich_requirements
from jobsearch.models import JobPosting

_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
_META_DESC_RE = re.compile(
    r'<meta[^>]+(?:name|property)=["\'](?:og:)?description["\'][^>]+content=["\'](.*?)["\']',
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")
_LI_RE = re.compile(r"<li[^>]*>(.*?)</li>", re.IGNORECASE | re.DOTALL)
_WS_RE = re.compile(r"[ \t\f\v]+")

# A placeholder description (see sourcing/job_email.py) or anything too short to be
# a real posting body — these are the ones worth enriching.
_PLACEHOLDER = re.compile(r"surfaced from a .*? email", re.IGNORECASE)
_MIN_REAL_DESC = 200


def _strip_html(raw: str) -> str:
    """HTML fragment -> readable plain text (unescaped, whitespace-collapsed)."""
    if not raw:
        return ""
    text = _TAG_RE.sub(" ", raw)
    text = _html.unescape(text)
    # collapse horizontal runs but keep line breaks so bullet structure survives
    text = _WS_RE.sub(" ", text)
    text = re.sub(r"\s*\n\s*\n\s*", "\n\n", text)
    return text.strip()


def _bullets(raw: str) -> list[str]:
    """Pull <li> items out of an HTML fragment as candidate requirements."""
    items = [_strip_html(m) for m in _LI_RE.findall(raw or "")]
    return [i for i in items if 3 <= len(i) <= 300]


def _iter_jsonld_objects(blob: str):
    """Yield every JSON object in a JSON-LD blob (handles a top-level array and
    ``@graph`` containers)."""
    try:
        data = json.loads(blob)
    except Exception:
        return
    stack = [data]
    while stack:
        node = stack.pop()
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            if "@graph" in node and isinstance(node["@graph"], list):
                stack.extend(node["@graph"])
            yield node


def _is_job_posting(obj: dict) -> bool:
    t = obj.get("@type")
    types = t if isinstance(t, list) else [t]
    return any(str(x).lower() == "jobposting" for x in types if x)


def extract_jd_from_html(html: str) -> dict:
    """Best-effort structured job description from a posting page's HTML.

    Returns a dict that may contain ``description`` (plain text), ``requirements``
    (list[str]) and ``company_logo_url``. Empty dict when nothing usable is found.
    Pure + network-free.
    """
    out: dict = {}
    if not html:
        return out

    # 1) schema.org JobPosting JSON-LD — the agnostic path.
    for blob in _LD_RE.findall(html):
        for obj in _iter_jsonld_objects(blob):
            if not _is_job_posting(obj):
                continue
            desc_html = obj.get("description") or ""
            desc = _strip_html(desc_html) if isinstance(desc_html, str) else ""
            reqs = _bullets(desc_html if isinstance(desc_html, str) else "")
            for key in ("qualifications", "skills", "responsibilities", "experienceRequirements"):
                val = obj.get(key)
                if isinstance(val, str):
                    reqs += _bullets(val) or [
                        s.strip() for s in re.split(r"[\n;•]", _strip_html(val)) if 3 <= len(s.strip()) <= 300
                    ]
                elif isinstance(val, list):
                    reqs += [str(v).strip() for v in val if isinstance(v, (str, int))][:20]
            org = obj.get("hiringOrganization")
            if isinstance(org, dict):
                logo = org.get("logo")
                if isinstance(logo, dict):
                    logo = logo.get("url")
                if isinstance(logo, str) and logo.startswith("http"):
                    out["company_logo_url"] = logo
            if desc:
                out["description"] = desc
            if reqs:
                # de-dup, preserve order, cap
                seen, uniq = set(), []
                for r in reqs:
                    k = r.lower()
                    if k not in seen:
                        seen.add(k)
                        uniq.append(r)
                out["requirements"] = uniq[:20]
            if out.get("description"):
                return out

    # 2) meta description fallback (short, but better than a placeholder).
    m = _META_DESC_RE.search(html)
    if m:
        desc = _strip_html(m.group(1))
        if len(desc) >= 40:
            out["description"] = desc
    return out


def needs_jd(job: JobPosting) -> bool:
    """True when the job has a fetchable URL but only a placeholder/thin body."""
    if not (job.url or "").startswith("http"):
        return False
    desc = (job.description or "").strip()
    return (not desc) or bool(_PLACEHOLDER.search(desc)) or len(desc) < _MIN_REAL_DESC


def apply_jd(job: JobPosting, extracted: dict) -> bool:
    """Merge an extracted JD into the job in place. Returns True if it changed."""
    changed = False
    desc = (extracted.get("description") or "").strip()
    # Only replace when the new body is a real improvement over what we have.
    if desc and len(desc) > len((job.description or "").strip()) and len(desc) >= 60:
        job.description = desc[:8000]
        changed = True
    reqs = extracted.get("requirements") or []
    if reqs and not job.requirements:
        job.requirements = enrich_requirements(list(reqs), f"{job.title}\n{job.description}")
        changed = True
    logo = extracted.get("company_logo_url")
    if logo and not getattr(job, "company_logo_url", ""):
        job.company_logo_url = logo
        changed = True
    if changed:
        job.category = detect_category(f"{job.title} {job.title} {job.description}")
    return changed


def fetch_jd(url: str, *, timeout: float = 12.0) -> dict:  # pragma: no cover - network
    """Fetch a posting page and extract its JD. Best-effort: never raises, returns
    {} on any network/parse failure or non-HTML response."""
    if not (url or "").startswith("http"):
        return {}
    import httpx

    headers = {
        # A browser-ish UA; many boards serve the JSON-LD to normal agents.
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        r = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
        if r.status_code != 200 or "html" not in r.headers.get("content-type", "").lower():
            return {}
        return extract_jd_from_html(r.text)
    except Exception:
        return {}


def enrich_job(job: JobPosting, *, timeout: float = 12.0) -> bool:  # pragma: no cover - network
    """Fetch + apply the full JD for one job when it needs it. Returns True if the
    job was enriched."""
    if not needs_jd(job):
        return False
    return apply_jd(job, fetch_jd(job.url, timeout=timeout))
