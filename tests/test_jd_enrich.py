"""Full-description enrichment: parse a posting page's JSON-LD / meta into a real
job description (network-free)."""

from __future__ import annotations

from jobsearch.engines.sourcing.jd_enrich import (
    apply_jd,
    extract_jd_from_html,
    needs_jd,
)
from jobsearch.models import JobPosting

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
