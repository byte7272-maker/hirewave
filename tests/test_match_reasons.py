from __future__ import annotations

import types

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.matching import MatchingEngine
from jobsearch.models import JobPosting, UserProfile
from jobsearch.models.user import JobPreferences, SalaryRange


# -- explanation generator --------------------------------------------------
def test_score_attaches_ranked_reasons(profile, matching_job):
    r = MatchingEngine().score(profile, matching_job)
    assert r.reasons, "a strong match must have reasons"
    labels = [x.label for x in r.reasons]
    # skills is the most concrete positive and should lead
    assert any("skill" in l.lower() for l in labels)
    assert r.reasons[0].sentiment == "positive"
    # the skill reason names actual overlapping skills
    skill_reason = next(x for x in r.reasons if "skill" in x.label.lower())
    assert "Python" in skill_reason.detail
    # remote preference match surfaces as a reason (the job is remote, profile remote_ok)
    assert any(x.label == "Remote" for x in r.reasons)
    # every reason is well-formed
    assert all(x.sentiment in ("positive", "neutral", "caution") for x in r.reasons)


def test_reasons_include_a_caution_on_a_weak_fit(profile, unrelated_job):
    r = MatchingEngine().score(profile, unrelated_job)
    # an unrelated role should carry at least one caution (gaps / level / location)
    assert any(x.sentiment == "caution" for x in r.reasons)


def test_pay_below_target_is_flagged():
    prof = UserProfile(
        user_id="u1", skills=["Python", "Django"],
        preferences=JobPreferences(salary_range=SalaryRange(minimum=180_000, maximum=220_000),
                                    remote_ok=True, seniority="senior"),
    )
    job = JobPosting(
        title="Backend Engineer", company="Acme", remote=True,
        description="Python Django role", requirements=["Python", "Django"],
        salary_range=SalaryRange(minimum=70_000, maximum=90_000),
    )
    r = MatchingEngine().score(prof, job)
    assert any(x.label == "Pay below your target" and x.sentiment == "caution" for x in r.reasons)


# -- API exposes reasons + breakdown ----------------------------------------
def test_matches_endpoint_returns_reasons_and_breakdown():
    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    client.post("/api/v1/auth/register",
                json={"email": "m@demo.com", "password": "supersecret12", "full_name": "M"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": "m@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    uid = state.user_by_email("m@demo.com").id
    state.profiles.add(UserProfile(
        user_id=uid, headline="Senior Backend Engineer",
        skills=["Python", "FastAPI", "AWS", "Kubernetes"],
        preferences=JobPreferences(salary_range=SalaryRange(minimum=150_000, maximum=200_000),
                                   remote_ok=True, seniority="senior"),
    ))
    state.jobs.add(JobPosting(
        source_platform="linkedin", title="Senior Backend Engineer", company="Globex",
        location="Remote", remote=True,
        description="Senior Backend Engineer building Python microservices with FastAPI on AWS and Kubernetes.",
        requirements=["Python", "FastAPI", "AWS", "Kubernetes"],
        salary_range=SalaryRange(minimum=160_000, maximum=210_000),
    ))
    data = client.get("/api/v1/jobs/matches", headers=h).json()
    assert data, "should return at least one match"
    top = data[0]
    assert top["reasons"] and all({"label", "detail", "sentiment"} <= set(r) for r in top["reasons"])
    assert any("skill" in r["label"].lower() for r in top["reasons"])
    # breakdown is the six components as 0-100 ints
    assert set(top["breakdown"]) == {"semantic", "skills", "location", "salary", "seniority", "recency"}
    assert all(0 <= v <= 100 for v in top["breakdown"].values())


# -- scheduler reaps connected email ----------------------------------------
def test_reap_email_ingests_job_mail_from_connected_gmail():
    from jobsearch.scheduler import reap_email

    sample = (
        "From: LinkedIn Job Alerts <jobs-noreply@linkedin.com>\n"
        "Subject: 3 new jobs for you\nContent-Type: text/plain\n\n"
        "Senior Backend Engineer at Globex — https://linkedin.com/jobs/view/42"
    )
    personal = "From: mom@gmail.com\nSubject: Dinner?\n\nCall me this weekend."
    calls = {"sync": []}

    class _Fetcher:
        live = True
        def fetch(self, *, access_token="", max_messages=10):
            return [sample, personal]

    class _Integration:
        def get_access_token(self, uid, provider):
            return "tok"

    class _Inbox:
        def sync(self, uid, raws):
            calls["sync"].append((uid, raws))
            return [], len(raws)

    class _Users:
        def all(self):
            return [types.SimpleNamespace(id="u1")]

    state = types.SimpleNamespace(
        gmail_fetcher=_Fetcher(), integration=_Integration(),
        inbox=_Inbox(), users=_Users(),
    )
    ingested = reap_email(state)
    # only the job email is ingested; the personal email is dropped by the privacy gate
    assert ingested == 1
    assert len(calls["sync"]) == 1 and len(calls["sync"][0][1]) == 1


def test_reap_email_is_noop_in_mock_mode():
    from jobsearch.scheduler import reap_email

    class _Fetcher:
        live = False
        def fetch(self, *, access_token="", max_messages=10):
            raise AssertionError("must not fetch in mock mode")

    state = types.SimpleNamespace(gmail_fetcher=_Fetcher())
    assert reap_email(state) == 0
