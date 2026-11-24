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
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlsplit

from jobsearch.models.common import utcnow
from jobsearch.engines.sourcing.skills import (
    detect_benefits,
    detect_category,
    detect_employment_type,
    detect_salary,
    detect_seniority,
    detect_years_experience,
    enrich_requirements,
)
from jobsearch.models import JobPosting
from jobsearch.models.user import SalaryRange

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


def _num(v) -> "Optional[int]":
    """Coerce a schema.org numeric (int/float/str) to a rounded int, else None."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(round(v)) or None
    if isinstance(v, str):
        s = re.sub(r"[,\s$]", "", v)
        try:
            return int(round(float(s))) or None
        except ValueError:
            return None
    return None


def _salary_from_ld(base) -> "Optional[dict]":
    """schema.org ``baseSalary`` (MonetaryAmount) → SalaryRange kwargs, annualising
    hourly pay. Returns ``{currency, minimum, maximum}`` or None."""
    if not isinstance(base, dict):
        return None
    currency = str(base.get("currency") or base.get("priceCurrency") or "USD").upper()[:3] or "USD"
    val = base.get("value", base)
    lo = hi = None
    unit = ""
    if isinstance(val, dict):
        unit = str(val.get("unitText") or "").upper()
        lo = _num(val.get("minValue"))
        hi = _num(val.get("maxValue"))
        if lo is None and hi is None:
            one = _num(val.get("value"))
            lo = hi = one
    else:
        lo = hi = _num(val)
    if lo is None and hi is None:
        return None
    if unit in ("HOUR", "HOURLY"):  # annualise
        lo = lo * 2080 if lo else lo
        hi = hi * 2080 if hi else hi
    elif unit in ("WEEK", "WEEKLY"):
        lo = lo * 52 if lo else lo
        hi = hi * 52 if hi else hi
    elif unit in ("MONTH", "MONTHLY"):
        lo = lo * 12 if lo else lo
        hi = hi * 12 if hi else hi
    return {"currency": currency, "minimum": lo, "maximum": hi}


def _location_from_ld(loc) -> str:
    """schema.org ``jobLocation`` (Place or list) → 'City, ST' / 'City, Country'."""
    if isinstance(loc, list):
        for item in loc:
            got = _location_from_ld(item)
            if got:
                return got
        return ""
    if not isinstance(loc, dict):
        return ""
    addr = loc.get("address")
    if isinstance(addr, list):
        addr = addr[0] if addr else None
    if isinstance(addr, str):
        return addr.strip()
    if not isinstance(addr, dict):
        return ""
    city = str(addr.get("addressLocality") or "").strip()
    region = str(addr.get("addressRegion") or "").strip()
    country = str(addr.get("addressCountry") or "").strip()
    if isinstance(addr.get("addressCountry"), dict):
        country = str(addr["addressCountry"].get("name") or "").strip()
    parts = [p for p in (city, region or country) if p]
    return ", ".join(parts)


_LD_EMPLOYMENT = {
    "full_time": "full-time", "fulltime": "full-time",
    "part_time": "part-time", "parttime": "part-time",
    "contractor": "contract", "contract": "contract",
    "temporary": "temporary", "intern": "internship", "internship": "internship",
}


def _employment_from_ld(val) -> str:
    """schema.org ``employmentType`` (str or list) → our slug."""
    vals = val if isinstance(val, list) else [val]
    for v in vals:
        key = re.sub(r"[^a-z]", "", str(v or "").lower())
        if key in _LD_EMPLOYMENT:
            return _LD_EMPLOYMENT[key]
    return ""


# --- raw-HTML mining (for boards that ship NO JobPosting JSON-LD) -------------
# Modern Indeed/LinkedIn job pages are React-rendered and carry no schema.org
# JobPosting block; the pay/location live in an embedded data JSON (and in the
# visible body). These anchors pull them out deterministically; a full-text
# detect_salary is the agnostic last resort.
_EMBED_SALARY_RE = re.compile(r'"salary(?:Text|Snippet|Range)"\s*:\s*"([^"]{3,100})"', re.IGNORECASE)
_EMBED_LOCATION_RE = re.compile(
    r'"(?:formattedLocation|jobLocation|jobNormalizedLocation)"\s*:\s*"([^"]{2,100})"',
    re.IGNORECASE,
)
# "Role - City, ST - Indeed.com" / "Role - City, ST | LinkedIn"
_TITLE_LOCATION_RE = re.compile(
    r"<title[^>]*>\s*.+?\s[-–|]\s([A-Za-z][^<|]*?,\s*[A-Za-z][^<|]*?)\s[-–|]\s(?:Indeed|LinkedIn|ZipRecruiter|Glassdoor)",
    re.IGNORECASE | re.DOTALL,
)
_EMBED_TELECOMMUTE_RE = re.compile(
    r'"(?:jobLocationType|workplaceType|remoteModel)"\s*:\s*"?(?:telecommute|remote)', re.IGNORECASE
)
_NON_LOCATIONS = {"remote", "united states", "us", "usa", "null", "", "anywhere"}


def _mine_raw_fields(html: str) -> dict:
    """Mine pay / location / benefits / employment / remote straight from a posting
    page's raw HTML, for boards that emit no JobPosting JSON-LD (Indeed, LinkedIn).

    Deterministic + network-free. Fills only what it can find; the caller merges
    these into any blanks the JSON-LD/meta path left behind."""
    out: dict = {}
    if not html:
        return out

    # Pay: an embedded salary string first (clean, e.g. "$140,000 - $170,000 a year"),
    # then a full-text scan as the agnostic fallback.
    for m in _EMBED_SALARY_RE.finditer(html):
        sal = detect_salary(_html.unescape(m.group(1)))
        if sal:
            out["salary_range"] = sal
            break
    text = _strip_html(html)
    if "salary_range" not in out:
        sal = detect_salary(text)
        if sal:
            out["salary_range"] = sal

    # Location: embedded JSON first, then the <title> "… - City, ST - Board" pattern.
    for m in _EMBED_LOCATION_RE.finditer(html):
        loc = _html.unescape(m.group(1)).strip()
        if loc and loc.lower() not in _NON_LOCATIONS:
            out["location"] = loc
            break
    if "location" not in out:
        mt = _TITLE_LOCATION_RE.search(html)
        if mt:
            loc = _html.unescape(mt.group(1)).strip()
            if "," in loc and loc.lower() not in _NON_LOCATIONS:
                out["location"] = loc

    # Benefits + employment type from the visible body.
    bens = detect_benefits(text)
    if bens:
        out["benefits"] = bens
    et = detect_employment_type(text)
    if et:
        out["employment_type"] = et

    # Remote: an explicit embedded flag, or a "Remote" location.
    if _EMBED_TELECOMMUTE_RE.search(html) or (out.get("location", "").lower() == "remote"):
        out["remote"] = True
    return out


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
    found_posting = False
    for blob in _LD_RE.findall(html):
        if found_posting:
            break
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
            # Structured fields the UI wants on every match: pay, where it's based,
            # workplace arrangement, employment type, benefits.
            salary = _salary_from_ld(obj.get("baseSalary"))
            if salary and "salary_range" not in out:
                out["salary_range"] = salary
            loc = _location_from_ld(obj.get("jobLocation"))
            if loc and "location" not in out:
                out["location"] = loc
            jlt = obj.get("jobLocationType")
            jlt_vals = jlt if isinstance(jlt, list) else [jlt]
            if any(str(v or "").upper() == "TELECOMMUTE" for v in jlt_vals):
                out["remote"] = True
            etype = _employment_from_ld(obj.get("employmentType"))
            if etype and "employment_type" not in out:
                out["employment_type"] = etype
            jb = obj.get("jobBenefits") or obj.get("benefits")
            if jb and "benefits" not in out:
                bl = jb if isinstance(jb, list) else [jb]
                out["benefits"] = detect_benefits(" ".join(str(b) for b in bl)) or [
                    str(b).strip() for b in bl if str(b).strip()
                ][:8]
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
                found_posting = True
                break

    # 2) meta description fallback (short, but better than a placeholder).
    if not out.get("description"):
        m = _META_DESC_RE.search(html)
        if m:
            desc = _strip_html(m.group(1))
            if len(desc) >= 40:
                out["description"] = desc

    # 3) raw-HTML mining — fill structured fields the JSON-LD/meta path missed.
    # Boards like Indeed ship no JobPosting JSON-LD, so pay/location/benefits
    # only surface here. Never overwrites a value the structured path already set.
    for key, val in _mine_raw_fields(html).items():
        if val and not out.get(key):
            out[key] = val
    return out


_PAGE_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_BOARD_SUFFIX_RE = re.compile(
    r"\s*[-–|]\s*(?:Indeed|LinkedIn|ZipRecruiter|Glassdoor|Monster|Dice|CareerBuilder"
    r"|SimplyHired|Wellfound|Lever|Greenhouse)(?:\.com)?\s*$",
    re.IGNORECASE,
)


def role_from_html(html: str) -> str:
    """Best-effort job title from a posting page — JSON-LD ``JobPosting.title`` first,
    else the ``<title>`` tag's leading segment with the board suffix stripped.

    Used to match a passively-scraped board page to one of the user's stored jobs
    (the passive path has the page but not the job id). Pure + network-free."""
    if not html:
        return ""
    for blob in _LD_RE.findall(html):
        for obj in _iter_jsonld_objects(blob):
            if _is_job_posting(obj):
                t = obj.get("title")
                if isinstance(t, str) and t.strip():
                    return _html.unescape(t.strip())[:120]
    m = _PAGE_TITLE_RE.search(html)
    if m:
        t = _BOARD_SUFFIX_RE.sub("", _html.unescape(_strip_html(m.group(1)))).strip()
        t = re.split(r"\s[-–|]\s", t)[0].strip()  # drop a trailing " - City, ST"
        if 2 <= len(t) <= 120:
            return t
    return ""


def backfill_fields(job: JobPosting) -> bool:
    """Re-mine a stored job's existing title + description for the structured display
    fields (pay, employment type, seniority, years, benefits) when they're missing.

    No network: this recovers data for postings ingested before these parsers existed,
    so an existing matches list can pick up salary/benefits without re-fetching. Only
    fills blanks — never overwrites a value already set. Returns True if anything
    changed."""
    blob = f"{job.title}\n{job.description}"
    changed = False
    if job.salary_range is None:
        parsed = detect_salary(blob)
        if parsed:
            job.salary_range = SalaryRange(**parsed)
            changed = True
    if not job.employment_type:
        et = detect_employment_type(blob)
        if et:
            job.employment_type = et
            changed = True
    if not job.seniority:
        sn = detect_seniority(blob)
        if sn:
            job.seniority = sn
            changed = True
    if job.years_experience is None:
        yr = detect_years_experience(blob)
        if yr is not None:
            job.years_experience = yr
            changed = True
    if not job.benefits:
        bn = detect_benefits(job.description)
        if bn:
            job.benefits = bn
            changed = True
    return changed


def needs_jd(job: JobPosting) -> bool:
    """True when the job has a fetchable URL but only a placeholder/thin body.

    This is the "could still use a real JD" test — used by the extension queue and the
    manual endpoint, which CAN fetch bot-walled pages the server can't. It deliberately
    ignores the server-side backoff (``jd_blocked``); the server pass uses
    ``due_for_server_fetch`` to respect that."""
    if not (job.url or "").startswith("http"):
        return False
    desc = (job.description or "").strip()
    return (not desc) or bool(_PLACEHOLDER.search(desc)) or len(desc) < _MIN_REAL_DESC


# --- server-side fetch backoff ------------------------------------------------
# A page the server can't fetch (login/bot-walled LinkedIn, Indeed) would otherwise
# be retried every tick, burning the bounded per-tick budget and starving jobs we
# CAN enrich. So the server pass retries on a widening schedule, then parks the job
# (``jd_blocked``). The extension/manual paths ignore this and may still try.
_JD_BACKOFF_HOURS = (1, 6, 24)  # min wait before attempt #2, #3, #4
_MAX_JD_ATTEMPTS = 4            # park after this many failed fetches


def _aware(dt: "Optional[datetime]") -> "Optional[datetime]":
    """Coerce a possibly-naive datetime to tz-aware UTC for safe comparison."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def due_for_server_fetch(job: JobPosting, now: "Optional[datetime]" = None) -> bool:
    """Whether the SERVER pass should attempt this job now: it needs a JD, isn't parked,
    and its backoff window has elapsed. Pure + network-free."""
    if not needs_jd(job) or job.jd_blocked:
        return False
    if job.jd_attempts <= 0 or job.jd_last_attempt is None:
        return True
    now = _aware(now) or utcnow()
    idx = min(job.jd_attempts, len(_JD_BACKOFF_HOURS)) - 1
    wait = timedelta(hours=_JD_BACKOFF_HOURS[idx])
    last = _aware(job.jd_last_attempt)
    return (now - last) >= wait


def record_attempt(job: JobPosting, *, enriched: bool, now: "Optional[datetime]" = None) -> None:
    """Record one server fetch attempt and park the job once it has failed
    ``_MAX_JD_ATTEMPTS`` times and still lacks a real JD. Pure + network-free.

    A successful enrich leaves the job un-parked (its body is now real, so ``needs_jd``
    is already False). Never re-parks an inferred body."""
    job.jd_attempts = int(job.jd_attempts or 0) + 1
    job.jd_last_attempt = _aware(now) or utcnow()
    if not enriched and job.jd_attempts >= _MAX_JD_ATTEMPTS and needs_jd(job):
        job.jd_blocked = True


def source_of(job: JobPosting) -> str:
    """A normalized source key for enrichment stats: the board name when we know it,
    else the URL host, else 'other'. Lets us see which sources never enrich."""
    sp = (job.source_platform or "").strip().lower()
    if sp and sp != "email":
        return sp
    host = urlsplit(job.url or "").netloc.lower()
    host = host[4:] if host.startswith("www.") else host
    for board in ("linkedin", "indeed", "glassdoor", "ziprecruiter", "monster", "dice",
                  "greenhouse", "lever", "ashby", "workday", "wellfound"):
        if board in host:
            return board
    return host or sp or "other"


def apply_jd(job: JobPosting, extracted: dict) -> bool:
    """Merge an extracted JD into the job in place. Returns True if it changed.

    A REAL fetched/captured description always supersedes a placeholder or an inferred
    (LLM-estimated) body — even when it's shorter — and clears the inferred/parked flags,
    because real employer text beats an estimate. Otherwise it only replaces a genuinely
    longer body (so a thinner re-fetch doesn't clobber a good description)."""
    changed = False
    desc = (extracted.get("description") or "").strip()
    cur = (job.description or "").strip()
    supersede = bool(desc) and len(desc) >= 60 and (
        getattr(job, "description_inferred", False)  # real text beats our estimate
        or bool(_PLACEHOLDER.search(cur))            # or a placeholder
        or not cur
    )
    if desc and len(desc) >= 60 and (supersede or len(desc) > len(cur)):
        job.description = desc[:8000]
        changed = True
        # A real posting body supersedes any estimate and un-parks the job.
        if getattr(job, "description_inferred", False):
            job.description_inferred = False
        if getattr(job, "jd_blocked", False):
            job.jd_blocked = False
    reqs = extracted.get("requirements") or []
    # Real requirements fill empties, and also REPLACE estimated ones when a real body
    # supersedes an inferred estimate (so stale guessed bullets don't linger).
    if reqs and (not job.requirements or supersede):
        job.requirements = enrich_requirements(list(reqs), f"{job.title}\n{job.description}")
        changed = True
    logo = extracted.get("company_logo_url")
    if logo and not getattr(job, "company_logo_url", ""):
        job.company_logo_url = logo
        changed = True

    # Pay, location, workplace, employment type, benefits — fill only when missing,
    # from the JSON-LD first, then a text fallback mined from the (now fuller) body.
    sr = extracted.get("salary_range")
    if sr is None and job.salary_range is None:
        sr = detect_salary(f"{job.title}\n{job.description}")
    if sr and job.salary_range is None:
        job.salary_range = SalaryRange(**sr)
        changed = True

    loc = (extracted.get("location") or "").strip()
    if loc and not (job.location or "").strip():
        job.location = loc
        changed = True

    if extracted.get("remote") and not job.remote:
        job.remote = True
        changed = True

    etype = extracted.get("employment_type") or detect_employment_type(f"{job.title}\n{job.description}")
    if etype and not job.employment_type:
        job.employment_type = etype
        changed = True

    benefits = extracted.get("benefits") or detect_benefits(job.description)
    if benefits and not job.benefits:
        job.benefits = benefits
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


def enrich_job(
    job: JobPosting, *, timeout: float = 12.0, now: "Optional[datetime]" = None,
    llm=None, infer: bool = False,
) -> bool:  # pragma: no cover - network
    """Fetch + apply the full JD for one job when it needs it, recording the attempt so
    the server pass can back off a page it can't reach. Returns True if the job changed.

    When a real fetch fails and the job becomes parked, and ``infer`` is on with an
    ``llm``, synthesize a clearly-labeled JD so matching still has real signal (B)."""
    if not needs_jd(job):
        return False
    changed = apply_jd(job, fetch_jd(job.url, timeout=timeout))
    record_attempt(job, enriched=changed, now=now)
    if changed:
        return True
    # Real fetch didn't help. Once parked, optionally synthesize a labeled JD — once.
    if infer and llm is not None and job.jd_blocked and not job.description_inferred and needs_jd(job):
        return apply_inferred_jd(job, llm)
    return False


# --- B: LLM-inferred JD fallback ----------------------------------------------
# When a posting's page can't be fetched (bot-walled board), synthesize a realistic,
# clearly-LABELED description from just the title/company/seniority so matching and the
# "why this match" answer have something concrete. The body is marked
# ``description_inferred`` so the UI can badge it; it is written to read as an ESTIMATE,
# never as the employer's own words. No salary/location/benefits are invented.
_INFER_SYSTEM = (
    "You write a short, realistic job description from only a role title, company and "
    "seniority. Output STRICT JSON and nothing else: "
    '{"description": "<2-4 sentences of likely responsibilities>", '
    '"requirements": ["<short skill/qualification>", ...]}. '
    "Give 4-8 requirements typical for the role. Do NOT invent salary, location, "
    "benefits, team names, or any company-specific fact. JSON only, no preamble."
)


def _parse_inferred(raw: str) -> dict:
    """Tolerantly parse the inference LLM's JSON (strips code fences / stray prose).
    Returns ``{description, requirements}`` or ``{}``. Pure + network-free."""
    s = (raw or "").strip()
    if not s:
        return {}
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.IGNORECASE).strip()
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        s = m.group(0)
    try:
        data = json.loads(s)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    desc = data.get("description")
    reqs = data.get("requirements")
    out: dict = {}
    if isinstance(desc, str) and desc.strip():
        out["description"] = desc.strip()
    if isinstance(reqs, list):
        clean = [r.strip() for r in reqs if isinstance(r, str) and 3 <= len(r.strip()) <= 300]
        if clean:
            out["requirements"] = clean[:12]
    return out


#: Appended to an inferred body so it can never be mistaken for the employer's own
#: posting — and deliberately NOT matching the matching engine's placeholder regex, so
#: an inferred JD counts as real signal (used at full weight, by product decision).
_INFER_LABEL = "Estimated role description, generated from the title — not the employer's posting."


def _apply_inferred(job: JobPosting, data: dict) -> bool:
    """Apply a parsed inferred JD to the job in place. Pure + network-free. Returns
    True if it wrote a usable body."""
    desc = (data.get("description") or "").strip()
    reqs = list(data.get("requirements") or [])
    if len(desc) < 60 and len(reqs) < 3:
        return False  # too thin to be worth labeling
    parts = [p for p in (desc, ("Typical requirements: " + "; ".join(reqs)) if reqs else "", _INFER_LABEL) if p]
    job.description = "\n\n".join(parts)[:8000]
    job.description_inferred = True
    if reqs and not job.requirements:
        job.requirements = enrich_requirements(reqs[:12], f"{job.title}\n{desc}")
    job.category = detect_category(f"{job.title} {job.title} {desc}")
    return True


def infer_jd(job: JobPosting, llm) -> dict:  # pragma: no cover - network
    """Ask the LLM for a synthetic JD for this role. Best-effort: never raises, {} on
    any error or unusable output."""
    prompt = (
        f"Title: {job.title}\nCompany: {job.company or 'unknown'}\n"
        f"Seniority: {job.seniority or 'unspecified'}\n"
        f"Employment type: {job.employment_type or 'unspecified'}"
    )
    try:
        raw = llm.complete(prompt, system=_INFER_SYSTEM, temperature=0.3, max_tokens=500)
    except Exception:
        return {}
    return _parse_inferred(raw)


def apply_inferred_jd(job: JobPosting, llm) -> bool:  # pragma: no cover - network
    """Infer + apply a labeled JD for a job whose page we couldn't fetch. Returns True
    if a usable inferred body was written."""
    return _apply_inferred(job, infer_jd(job, llm))
