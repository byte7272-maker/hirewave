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
from jobsearch.engines.sourcing.aggregator import _absorb_richer
from jobsearch.engines.sourcing.email_import import _is_job_href, parse_job_alert
from jobsearch.engines.sourcing.jd_enrich import apply_jd, backfill_fields, extract_jd_from_html
from jobsearch.engines.sourcing.job_email import (
    _extract_link,
    better_title,
    classify_job_email,
    email_to_posting,
    repair_email_title,
)
from jobsearch.engines.sourcing.skills import detect_salary
from jobsearch.models import JobPosting
from jobsearch.models.job import workplace_label
from jobsearch.models.user import SalaryRange


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


# --- refresh / reimport overwrites with the latest version ------------------
def test_absorb_richer_takes_latest_structured_fields():
    # A re-pull that now carries pay/benefits/location overwrites the stored blanks.
    existing = JobPosting(title="Engineer", company="Acme", description="old body")
    incoming = JobPosting(
        title="Engineer", company="Acme", description="old body",
        salary_range=SalaryRange(minimum=100000, maximum=120000),
        benefits=["Medical"], location="Austin, TX", employment_type="full-time",
    )
    _absorb_richer(existing, incoming)
    assert existing.salary_range.maximum == 120000
    assert existing.benefits == ["Medical"]
    assert existing.location == "Austin, TX"
    assert existing.employment_type == "full-time"


def test_absorb_richer_blank_repull_keeps_known_values():
    # A thin re-pull must never null a value we already know.
    existing = JobPosting(
        title="Engineer", company="Acme",
        salary_range=SalaryRange(minimum=100000, maximum=120000), benefits=["Medical"],
    )
    _absorb_richer(existing, JobPosting(title="Engineer", company="Acme"))
    assert existing.salary_range.maximum == 120000
    assert existing.benefits == ["Medical"]


def test_backfill_fields_recovers_from_existing_description():
    job = JobPosting(
        title="Senior Analyst",
        description="Established team. Compensation: $70,000 - $85,000, medical and dental. 5+ years required.",
    )
    assert backfill_fields(job) is True
    assert job.salary_range and job.salary_range.maximum == 85000
    assert "Medical" in job.benefits
    assert job.seniority == "senior"
    assert job.years_experience == 5


def _uid(state, email):
    return next(u.id for u in state.users.all() if u.email == email)


def test_reimport_backfills_salary_and_benefits_on_existing_matches():
    state, c = _client()
    h = _auth(c, email="reimport@x.com")
    uid = _uid(state, "reimport@x.com")
    state.jobs.add(JobPosting(
        owner_id=uid, title="Data Analyst", company="Globex",
        description="Great role. Salary range $70,000 - $85,000 plus medical, dental, and 401(k).",
    ))
    r = c.post("/api/v1/jobs/reimport", headers=h)
    assert r.status_code == 200 and r.json()["backfilled"] >= 1
    matches = c.get("/api/v1/jobs/matches", headers=h).json()
    globex = next(m for m in matches if m["company"] == "Globex")
    assert globex["salary_display"]
    assert globex["benefits"]


# --- the posting link must reach the real job, not a board search -----------
def test_is_job_href_accepts_tracking_hosts_rejects_noise():
    assert _is_job_href("https://cts.indeed.com/v3/AAAABBBCCC")  # Indeed click-tracking
    assert _is_job_href("https://www.indeed.com/viewjob?jk=25a632b64093d86d")
    assert _is_job_href("https://comm.linkedin.com/comm/jobs/view/12345")
    assert not _is_job_href("https://indeed.com/account/unsubscribe")
    assert not _is_job_href("mailto:jobs@x.com")
    assert not _is_job_href("")


def test_extract_link_keeps_indeed_tracking_url():
    body = "Great match for you! https://cts.indeed.com/v3/opaqueTOKEN123 — apply today."
    assert _extract_link("New job alert", body) == "https://cts.indeed.com/v3/opaqueTOKEN123"


def test_alert_import_captures_tracking_link_so_source_url_is_not_a_search():
    # An Indeed digest links each role through cts.indeed.com. We must keep that link
    # as the posting url, so the match opens the real posting (source_url == url),
    # not a /jobs?q= search.
    eml = (
        "From: alerts@indeed.com\r\n"
        "Subject: New jobs for you\r\n"
        "Content-Type: text/html\r\n\r\n"
        '<html><body><a href="https://cts.indeed.com/v3/opaqueTOKEN123">'
        "Senior IT Manager</a><div>Acme Corp · Austin, TX</div></body></html>"
    )
    parsed = parse_job_alert(eml)
    assert parsed.postings, "the tracking-linked role should be captured"
    p = parsed.postings[0]
    assert p["url"] == "https://cts.indeed.com/v3/opaqueTOKEN123"
    # And through the model, source_url returns that direct (redirecting) link, not a search.
    job = JobPosting(source_platform="indeed", title=p["title"], company=p.get("company", ""),
                     url=p["url"])
    assert job.source_url == "https://cts.indeed.com/v3/opaqueTOKEN123"
    assert "/jobs?q=" not in job.source_url


# --- title extraction: the full role, not a truncated fragment -------------
def test_better_title_prefers_full_subject_over_truncated_role():
    # Regex role truncates at the comma ("Technology"); the subject carries the full
    # title "Senior Manager, Technology" with the company stripped off.
    subject = "Senior Manager, Technology @ Bryan Cave Leighton Paisner LLP"
    assert better_title(subject, "Bryan Cave Leighton Paisner LLP", "Technology") == \
        "Senior Manager, Technology"


def test_better_title_strips_leadins_and_separators():
    assert better_title("Exciting opportunity: Data Engineer at Acme", "Acme", "") == "Data Engineer"
    assert better_title("Re: Staff Accountant - Globex Corp", "Globex Corp", "Staff Accountant") == \
        "Staff Accountant"


def test_better_title_keeps_role_when_subject_is_a_digest():
    # A multi-job digest subject isn't a title — keep the extracted role.
    assert better_title("New jobs for you", "", "Data Analyst") == "Data Analyst"


def test_email_to_posting_uses_full_title_from_subject():
    c = classify_job_email(
        "recruiter@bclplaw.com",
        "Senior Manager, Technology @ Bryan Cave Leighton Paisner LLP",
        "I came across your profile and wanted to reach out about the Technology position "
        "at Bryan Cave. Would you be open to a chat?",
    )
    posting = email_to_posting(c)
    assert posting is not None
    assert posting["title"] == "Senior Manager, Technology"


def test_repair_email_title_fixes_existing_truncated_job():
    job = JobPosting(
        source_platform="indeed", title="Technology", company="Bryan Cave Leighton Paisner LLP",
        description="Senior Manager, Technology @ Bryan Cave Leighton Paisner LLP — "
                    "surfaced from a recruiter email in your connected inbox.",
    )
    assert repair_email_title(job) is True
    assert job.title == "Senior Manager, Technology"
    # Idempotent: a second pass makes no change.
    assert repair_email_title(job) is False


def test_repair_email_title_never_swaps_to_something_unrelated():
    job = JobPosting(
        title="Data Scientist", company="Acme",
        description="Marketing Lead @ Acme — surfaced from a recruiter email in your connected inbox.",
    )
    # The candidate doesn't contain the current title → leave it alone.
    assert repair_email_title(job) is False
    assert job.title == "Data Scientist"


def test_reimport_clear_reseeds_enriched_samples():
    state, c = _client()
    h = _auth(c, email="clear@x.com")
    assert c.get("/api/v1/jobs/matches", headers=h).json()  # starts with samples
    body = c.post("/api/v1/jobs/reimport?clear=true", headers=h).json()
    assert body["cleared"] >= 3
    assert body["reseeded"] == 3  # no connected real jobs → re-seed so it's not blank
    after = c.get("/api/v1/jobs/matches", headers=h).json()
    assert len(after) == 3
    assert all(m["salary_display"] for m in after)  # re-seeded samples carry pay
