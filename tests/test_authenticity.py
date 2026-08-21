"""Shared job-authenticity ledger — employer check, verdict fusion, API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.authenticity import JobAuthenticityEngine, MockEmployerVerifier, norm_key
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import EmployerStatus, JobPosting, ReportVerdict, Verdict


def _job(**kw) -> JobPosting:
    base = dict(title="Backend Engineer", company="Northwind Labs", company_domain="northwind.io", url="https://northwind.io/jobs/1")
    base.update(kw)
    return JobPosting(**base)


# --- employer verifier ------------------------------------------------------
def test_mock_verifier_flags_shortener_and_missing_domain():
    v = MockEmployerVerifier()
    assert v.check(_job(url="https://bit.ly/x"))[0] == EmployerStatus.NOT_FOUND
    assert v.check(_job(company_domain=""))[0] == EmployerStatus.INVALID_DOMAIN
    assert v.check(_job())[0] == EmployerStatus.LISTED


# --- verdict fusion ---------------------------------------------------------
def test_employer_listed_plus_community_trust_is_verified_real():
    eng = JobAuthenticityEngine()
    job = _job()
    eng.check_employer(job, authenticity_score=90)
    rec = eng.report("u1", job, ReportVerdict.LEGIT, authenticity_score=90)
    assert rec.verdict == Verdict.VERIFIED_REAL


def test_three_scam_reports_make_likely_scam():
    eng = JobAuthenticityEngine()
    job = _job()
    for u in ("a", "b", "c"):
        rec = eng.report(u, job, ReportVerdict.SCAM, authenticity_score=100)
    assert rec.verdict == Verdict.LIKELY_SCAM
    assert rec.tally() == {"legit": 0, "dubious": 0, "scam": 3}


def test_low_fraud_score_alone_is_likely_scam():
    eng = JobAuthenticityEngine()
    rec = eng.snapshot(_job(company_domain=""), authenticity_score=20)
    assert rec.verdict == Verdict.LIKELY_SCAM


def test_not_found_employer_is_dubious():
    eng = JobAuthenticityEngine()
    rec = eng.check_employer(_job(url="https://bit.ly/x"), authenticity_score=80)
    assert rec.verdict in {Verdict.DUBIOUS, Verdict.LIKELY_SCAM}
    assert rec.employer_status == EmployerStatus.NOT_FOUND


def test_one_vote_per_user_latest_wins():
    eng = JobAuthenticityEngine()
    job = _job()
    eng.report("u1", job, ReportVerdict.SCAM, authenticity_score=100)
    rec = eng.report("u1", job, ReportVerdict.LEGIT, authenticity_score=100)  # changed mind
    assert rec.tally() == {"legit": 1, "dubious": 0, "scam": 0}


def test_records_are_shared_by_identity():
    eng = JobAuthenticityEngine()
    a = _job(url="https://indeed.com/1")
    b = _job(url="https://glassdoor.com/2")  # same company+title, different board
    eng.report("u1", a, ReportVerdict.SCAM, authenticity_score=100)
    rec = eng.report("u2", b, ReportVerdict.SCAM, authenticity_score=100)
    assert norm_key(a.company, a.title) == norm_key(b.company, b.title)
    assert rec.tally()["scam"] == 2  # both reports landed on one shared record


def test_flagged_excludes_clean_records():
    eng = JobAuthenticityEngine()
    eng.check_employer(_job(), authenticity_score=95)  # clean → not flagged
    # a scam posting: low fraud score (as the API folds in) + a scam report
    eng.report("a", _job(company="QuickCash", url="https://bit.ly/x", company_domain=""), ReportVerdict.SCAM, authenticity_score=20)
    flagged = eng.flagged()
    assert [f.company for f in flagged] == ["QuickCash"]


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str = "a@b.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _seed_job(client: TestClient, h: dict) -> str:
    client.post("/api/v1/job-search/run", headers=h, json={"role": "Backend Engineer", "remote": True})
    jobs = client.get("/api/v1/jobs?include_hidden=true", headers=h).json()
    return next(j["id"] for j in jobs if j["company"] == "QuickCash Global")


def test_api_report_and_flagged_shared_between_users():
    client = _client()
    h1 = _auth(client, "a@b.com")
    jid = _seed_job(client, h1)
    r = client.post(f"/api/v1/authenticity/job/{jid}/report", headers=h1, json={"verdict": "scam", "reason": "wanted a fee"})
    assert r.status_code == 200
    body = r.json()
    assert body["your_vote"] == "scam" and "votes" not in body  # voter ids hidden
    assert "wanted a fee" in body["reasons"]
    # a second user sees the shared verdict + their own (absent) vote
    h2 = _auth(client, "b@c.com")
    got = client.get(f"/api/v1/authenticity/job/{jid}", headers=h2).json()
    assert got["tally"]["scam"] >= 1 and got["your_vote"] is None
    flagged = client.get("/api/v1/authenticity/flagged", headers=h2).json()
    assert any(f["company"] == "QuickCash Global" for f in flagged)


def test_api_verify_employer():
    client = _client()
    h = _auth(client)
    jid = _seed_job(client, h)
    r = client.post(f"/api/v1/authenticity/job/{jid}/verify-employer", headers=h).json()
    assert r["employer_status"] == "not_found"  # scam hides behind a shortener


def test_api_bad_verdict_and_missing_job():
    client = _client()
    h = _auth(client)
    jid = _seed_job(client, h)
    assert client.post(f"/api/v1/authenticity/job/{jid}/report", headers=h, json={"verdict": "nope"}).status_code == 400
    assert client.get("/api/v1/authenticity/job/job_missing", headers=h).status_code == 404


def test_api_requires_auth():
    client = _client()
    assert client.get("/api/v1/authenticity/flagged").status_code == 401
