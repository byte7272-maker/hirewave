"""Job-info enrichment: skill extraction from descriptions + posted_at/recency."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.matching.scoring import recency_fit
from jobsearch.engines.sourcing.skills import (
    detect_benefits,
    detect_employment_type,
    detect_seniority,
    detect_years_experience,
    enrich_requirements,
    extract_skills,
)
from jobsearch.models import JobPosting
from jobsearch.models.common import utcnow


# --- skill extraction -------------------------------------------------------
def test_extract_skills_from_description():
    text = "Build and scale services in Python and AWS, using Docker and Kubernetes. Strong SQL and REST API design."
    skills = extract_skills(text)
    for s in ("Python", "AWS", "Docker", "Kubernetes", "SQL"):
        assert s in skills


def test_enrich_drops_generic_when_concrete_found():
    reqs = ["Backend Engineer", "Collaboration", "Communication"]
    text = "Own core work in Python and AWS with Kubernetes."
    out = enrich_requirements(reqs, text)
    assert "Collaboration" not in out and "Communication" not in out  # generic dropped
    assert "Backend Engineer" in out  # real requirement kept
    assert "Python" in out and "AWS" in out and "Kubernetes" in out


def test_enrich_keeps_generics_when_nothing_concrete():
    out = enrich_requirements(["Communication"], "A general role with no listed tools.")
    assert out == ["Communication"]  # nothing better found → keep what we had


# --- structured metadata ----------------------------------------------------
def test_detect_job_metadata():
    text = ("Senior Backend Engineer — full-time. Requires 5+ years of experience. "
            "Benefits: medical, dental, 401(k), and remote work with equity.")
    assert detect_seniority(text) == "senior"
    assert detect_employment_type(text) == "full-time"
    assert detect_years_experience(text) == 5
    bens = detect_benefits(text)
    for b in ("Medical", "Dental", "401(k)", "Remote", "Equity"):
        assert b in bens


def test_metadata_populated_on_ingested_job():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register", json={"email": "m@demo.com", "password": "supersecret12", "full_name": "M"})
    tok = client.post("/api/v1/auth/login", json={"email": "m@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    client.post("/api/v1/job-search/run", headers=h, json={"role": "senior backend engineer", "location": "NYC", "remote": True})
    jobs = [j for j in client.get("/api/v1/jobs", headers=h).json() if j["company"] != "QuickCash Global"]
    j = jobs[0]
    assert j["seniority"] == "senior"  # parsed from the "Senior ..." title
    assert "seniority" in j and "employment_type" in j and "benefits" in j  # fields present
    assert j["times_seen"] >= 1 and j["first_seen_at"] and j["last_seen_at"]


# --- repeat sightings -------------------------------------------------------
def test_repeat_search_increments_times_seen():
    from jobsearch.engines.sourcing.aggregator import JobAggregator
    from jobsearch.engines.verification import VerificationEngine
    from jobsearch.store import InMemoryRepository

    jobs = InMemoryRepository()
    agg = JobAggregator([], jobs, VerificationEngine(), {})
    raw = [{"source_platform": "linkedin", "external_id": "abc",
            "title": "Backend Engineer", "company": "Globex", "location": "NYC",
            "description": "Python and AWS."}]
    agg.ingest(list(raw))            # first sighting
    agg.ingest(list(raw))            # seen again
    agg.ingest(list(raw))            # and again
    stored = jobs.all()
    assert len(stored) == 1  # still one job, not three
    assert stored[0].times_seen == 3
    assert stored[0].last_seen_at >= stored[0].first_seen_at


# --- recency ----------------------------------------------------------------
def test_posted_ago_and_age():
    fresh = JobPosting(title="x", posted_at=utcnow() - timedelta(days=2))
    assert fresh.age_days == 2 and fresh.posted_ago == "2 days ago"
    old = JobPosting(title="x", posted_at=utcnow() - timedelta(days=45))
    assert old.posted_ago == "1 month ago"
    unknown = JobPosting(title="x")
    assert unknown.age_days is None and unknown.posted_ago == ""


def test_recency_fit_curve():
    assert recency_fit(JobPosting(title="x", posted_at=utcnow() - timedelta(days=1))) == 1.0
    assert recency_fit(JobPosting(title="x", posted_at=utcnow() - timedelta(days=200))) == 0.15
    assert recency_fit(JobPosting(title="x")) == 0.5  # unknown = neutral
    mid = recency_fit(JobPosting(title="x", posted_at=utcnow() - timedelta(days=30)))
    assert 0.15 < mid < 1.0


# --- end to end via ingestion -----------------------------------------------
def test_search_ingests_enriched_and_dated_jobs():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register", json={"email": "je@demo.com", "password": "supersecret12", "full_name": "JE"})
    tok = client.post("/api/v1/auth/login", json={"email": "je@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    client.post("/api/v1/job-search/run", headers=h, json={"role": "backend engineer", "location": "NYC", "remote": True})
    jobs = client.get("/api/v1/jobs", headers=h).json()
    assert jobs
    legit = [j for j in jobs if j["company"] != "QuickCash Global"]
    j = legit[0]
    # enriched requirements now include concrete skills mined from the description
    reqs_lower = " ".join(j["requirements"]).lower()
    assert "python" in reqs_lower or "aws" in reqs_lower or "kubernetes" in reqs_lower
    # posted_at is now populated, and posted_ago is exposed
    assert j["posted_at"] is not None
    assert j["posted_ago"]  # non-empty human string
