"""Matches must surface the things a seeker scans for: pay range, where the role
is based, the workplace arrangement (remote/hybrid/on-site), employment type and
benefits. These were parsed inconsistently (or not at all) and not all were
exposed on the API — this pins the reaping and the exposure end to end."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing.jd_enrich import apply_jd, extract_jd_from_html
from jobsearch.engines.sourcing.skills import detect_salary
from jobsearch.models import JobPosting
from jobsearch.models.job import workplace_label


# --- salary parsing ---------------------------------------------------------
def test_detect_salary_range_with_k_shorthand():
    assert detect_salary("Base salary of $90k - $130k per year") == {
        "currency": "USD", "minimum": 90000, "maximum": 130000,
    }


def test_detect_salary_full_numbers():
    assert detect_salary("Compensation: $120,000 to $150,000") == {
        "currency": "USD", "minimum": 120000, "maximum": 150000,
    }


def test_detect_salary_up_to_and_from():
    assert detect_salary("Salary up to $130k")["maximum"] == 130000
    assert detect_salary("Salary up to $130k")["minimum"] is None
    assert detect_salary("Pay from $90,000")["minimum"] == 90000


def test_detect_salary_hourly_is_annualised():
    got = detect_salary("Pay: $55 per hour")
    assert got == {"currency": "USD", "minimum": 55 * 2080, "maximum": 55 * 2080}


def test_detect_salary_ignores_non_pay_dollars():
    # A funding/revenue figure with no pay context must not be read as salary.
    assert detect_salary("We just raised $10M in funding to grow the team") is None
    assert detect_salary("Lead a product squad from discovery to launch") is None


# --- workplace label --------------------------------------------------------
def test_workplace_label_variants():
    assert workplace_label(True, "Remote (US)") == "Remote"
    assert workplace_label(False, "San Francisco, CA") == "On-site"
    assert workplace_label(False, "", "Hybrid schedule, 3 days in office") == "Hybrid"
    assert workplace_label(True, "New York, NY") == "Hybrid"  # remote + a named metro
    assert workplace_label(False, "") == ""  # unknown


def test_job_posting_exposes_workplace():
    assert JobPosting(remote=True, location="Remote").workplace == "Remote"
    assert JobPosting(remote=False, location="Austin, TX").workplace == "On-site"


# --- JSON-LD reaping --------------------------------------------------------
_LD_HTML = """
<html><head>
<script type="application/ld+json">
{"@type": "JobPosting", "title": "Staff Engineer",
 "description": "<p>Build the platform. Own reliability and scale.</p><ul><li>8+ years</li></ul>",
 "jobLocationType": "TELECOMMUTE",
 "employmentType": "FULL_TIME",
 "jobBenefits": "Medical, dental, 401(k), and equity",
 "baseSalary": {"@type": "MonetaryAmount", "currency": "USD",
   "value": {"@type": "QuantitativeValue", "minValue": 160000, "maxValue": 200000, "unitText": "YEAR"}},
 "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress",
   "addressLocality": "Seattle", "addressRegion": "WA"}}}
</script></head><body>x</body></html>
"""


def test_extract_jd_reaps_structured_fields():
    out = extract_jd_from_html(_LD_HTML)
    assert out["salary_range"] == {"currency": "USD", "minimum": 160000, "maximum": 200000}
    assert out["location"] == "Seattle, WA"
    assert out["remote"] is True
    assert out["employment_type"] == "full-time"
    assert "Medical" in out["benefits"] and "401(k)" in out["benefits"]


def test_apply_jd_fills_missing_fields():
    job = JobPosting(title="Staff Engineer", url="https://x.co/j", description="short")
    changed = apply_jd(job, extract_jd_from_html(_LD_HTML))
    assert changed
    assert job.salary_range and job.salary_range.minimum == 160000
    assert job.location == "Seattle, WA"
    assert job.remote is True
    assert job.employment_type == "full-time"
    assert job.benefits
    # Workplace is derived: remote + a named metro reads as hybrid.
    assert job.workplace in ("Remote", "Hybrid")


def test_apply_jd_salary_text_fallback_when_no_jsonld():
    job = JobPosting(title="Analyst", url="https://x.co/j",
                     description="Great role. Salary range $70,000 - $85,000 plus medical.")
    apply_jd(job, {})  # no structured data → mine the body
    assert job.salary_range and job.salary_range.maximum == 85000
    assert "Medical" in job.benefits


# --- end-to-end exposure on the matches API ---------------------------------
def _client():
    state = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="fields@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "F"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_matches_api_exposes_pay_workplace_benefits():
    _, c = _client()
    h = _auth(c)
    matches = c.get("/api/v1/jobs/matches", headers=h).json()
    assert matches, "a fresh account should see sample matches"
    # Every sample now carries pay, a workplace label, employment type and benefits,
    # and the keys are present on the payload for the frontend to read.
    for m in matches:
        assert {"workplace", "benefits", "employment_type", "seniority",
                "salary_display", "location"} <= set(m)
    assert any(m["salary_display"] for m in matches)
    assert any(m["benefits"] for m in matches)
    assert all(m["workplace"] in ("Remote", "Hybrid", "On-site", "") for m in matches)
    assert any(m["workplace"] for m in matches)
