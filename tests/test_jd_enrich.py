"""Full-description enrichment: parse a posting page's JSON-LD / meta into a real
job description (network-free)."""

from __future__ import annotations

from datetime import timedelta

from jobsearch.engines.sourcing.jd_enrich import (
    _apply_inferred,
    _parse_inferred,
    apply_jd,
    due_for_server_fetch,
    extract_jd_from_html,
    needs_jd,
    record_attempt,
    source_of,
)
from jobsearch.models import JobPosting
from jobsearch.models.common import utcnow

_JSONLD_PAGE = """
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Platform Engineer",
  "description": "<p>We are hiring a <b>Senior Platform Engineer</b> to own our Kubernetes fleet across multiple regions. You will design resilient infrastructure, lead incident response, mentor engineers, and partner with product teams to ship reliably at scale in a fast-moving environment.</p><ul><li>5+ years with AWS and Terraform</li><li>Strong Python and Go</li></ul>",
  "qualifications": "Experience with CI/CD; On-call ownership",
  "hiringOrganization": {"@type": "Organization", "name": "Globex", "logo": {"url": "https://cdn.globex.com/logo.png"}}
}
</script>
</head><body>...</body></html>
"""

_META_PAGE = """
<html><head>
<meta property="og:description" content="Join Initech as a Support Lead helping customers succeed with our platform." />
</head><body>no json-ld here</body></html>
"""


def test_extract_from_jsonld():
    out = extract_jd_from_html(_JSONLD_PAGE)
    assert "Kubernetes fleet" in out["description"]
    assert "<b>" not in out["description"]  # tags stripped
    assert any("AWS and Terraform" in r for r in out["requirements"])
    assert out["company_logo_url"] == "https://cdn.globex.com/logo.png"


def test_meta_description_fallback():
    out = extract_jd_from_html(_META_PAGE)
    assert "Support Lead" in out["description"]


def test_extract_handles_garbage():
    assert extract_jd_from_html("") == {}
    assert extract_jd_from_html("<html><body>nothing useful</body></html>") == {}


def test_needs_jd_detects_placeholder_and_requires_url():
    placeholder = JobPosting(
        title="SRE", company="Acme", url="https://acme.com/jobs/1",
        description="Senior SRE — surfaced from a job_alert email in your connected inbox.",
    )
    assert needs_jd(placeholder) is True
    # No URL -> can't fetch -> not a candidate.
    assert needs_jd(JobPosting(title="SRE", company="Acme", description="short")) is False
    # Real, long description -> leave it alone.
    real = JobPosting(
        title="SRE", company="Acme", url="https://acme.com/jobs/1",
        description="x" * 400,
    )
    assert needs_jd(real) is False


def test_apply_jd_fills_in_place():
    job = JobPosting(
        title="Senior Platform Engineer", company="Globex",
        url="https://globex.com/jobs/1",
        description="Senior Platform Engineer — surfaced from a job_alert email in your connected inbox.",
    )
    assert needs_jd(job) is True
    changed = apply_jd(job, extract_jd_from_html(_JSONLD_PAGE))
    assert changed is True
    assert "Kubernetes fleet" in job.description
    assert job.requirements  # enriched from the bullets
    assert needs_jd(job) is False  # no longer a candidate


# --- A: server-side backoff + attempt tracking --------------------------------

def _url_job() -> JobPosting:
    return JobPosting(
        title="SRE", company="Acme", url="https://www.linkedin.com/jobs/view/1",
        description="SRE — surfaced from a job_alert email in your connected inbox.",
    )


def test_due_for_server_fetch_respects_backoff_then_parks():
    now = utcnow()
    job = _url_job()
    # Never tried -> due immediately.
    assert due_for_server_fetch(job, now) is True

    # One failed attempt -> not due until the first backoff window elapses.
    record_attempt(job, enriched=False, now=now)
    assert job.jd_attempts == 1 and job.jd_blocked is False
    assert due_for_server_fetch(job, now) is False
    assert due_for_server_fetch(job, now + timedelta(hours=2)) is True  # 1h window passed

    # Keep failing until it parks; a parked job is never due again.
    t = now
    for _ in range(3):
        t = t + timedelta(hours=48)
        record_attempt(job, enriched=False, now=t)
    assert job.jd_blocked is True
    assert due_for_server_fetch(job, t + timedelta(days=30)) is False


def test_successful_enrich_does_not_park():
    now = utcnow()
    job = _url_job()
    record_attempt(job, enriched=False, now=now)
    # A real body arrives -> needs_jd is False, so record never parks it.
    job.description = "x" * 400
    record_attempt(job, enriched=True, now=now)
    assert job.jd_blocked is False
    assert due_for_server_fetch(job, now + timedelta(days=5)) is False  # no longer needs a JD


def test_needs_jd_ignores_block_but_server_gate_respects_it():
    job = _url_job()
    job.jd_blocked = True
    # The extension/manual path still sees it as needing a JD...
    assert needs_jd(job) is True
    # ...but the server pass skips a parked job.
    assert due_for_server_fetch(job, utcnow()) is False


# --- E: source classification -------------------------------------------------

def test_source_of_prefers_platform_then_url_host():
    assert source_of(JobPosting(title="x", source_platform="greenhouse")) == "greenhouse"
    assert source_of(JobPosting(title="x", url="https://www.indeed.com/viewjob?jk=1")) == "indeed"
    assert source_of(JobPosting(title="x", source_platform="email",
                                url="https://boards.greenhouse.io/acme/jobs/1")) == "greenhouse"
    assert source_of(JobPosting(title="x")) == "other"


# --- B: inferred-JD parsing + apply (pure parts) ------------------------------

def test_parse_inferred_tolerates_code_fences_and_prose():
    raw = (
        "Here you go:\n```json\n"
        '{"description": "Own the CI/CD platform and mentor engineers.", '
        '"requirements": ["5+ years Python", "AWS", "x"]}\n```'
    )
    out = _parse_inferred(raw)
    assert out["description"].startswith("Own the CI/CD")
    # "x" (too short) is dropped; valid ones kept.
    assert out["requirements"] == ["5+ years Python", "AWS"]


def test_parse_inferred_rejects_garbage():
    assert _parse_inferred("not json at all") == {}
    assert _parse_inferred("") == {}


def test_apply_inferred_labels_and_counts_as_real_signal():
    from jobsearch.engines.matching.scoring import _has_real_jd

    job = _url_job()
    ok = _apply_inferred(job, {
        "description": "Own the Kubernetes fleet, lead incident response, and mentor engineers "
                       "across multiple regions in a fast-moving platform team.",
        "requirements": ["5+ years AWS", "Terraform", "Python", "On-call ownership"],
    })
    assert ok is True
    assert job.description_inferred is True
    assert "Estimated role description" in job.description  # clearly labeled
    assert job.requirements  # populated
    # Must NOT look like a placeholder to the matcher -> used at full weight.
    assert _has_real_jd(job.description, job.requirements) is True


def test_apply_inferred_rejects_thin_output():
    job = _url_job()
    assert _apply_inferred(job, {"description": "short", "requirements": []}) is False
    assert job.description_inferred is False


def test_real_jd_supersedes_an_inferred_body_and_clears_flags():
    # The user opens the real posting (clearing any bot-wall) and we capture it; a REAL
    # body must replace our estimate even if it's shorter, and un-park/un-flag the job.
    job = _url_job()
    _apply_inferred(job, {
        "description": "A long estimated description. " * 20,  # deliberately verbose
        "requirements": ["Guessed skill A", "Guessed skill B"],
    })
    job.jd_blocked = True
    assert job.description_inferred is True

    real = {"description": "Own the Kubernetes fleet across regions; lead incident response "
                           "and mentor the platform team.",  # real, >60 chars but far shorter
            "requirements": ["AWS", "Terraform"]}
    assert apply_jd(job, real) is True
    assert job.description.startswith("Own the Kubernetes fleet")
    assert job.description_inferred is False  # estimate replaced by real text
    assert job.jd_blocked is False            # and un-parked
    assert "Guessed skill A" not in job.requirements  # stale estimated bullets gone
