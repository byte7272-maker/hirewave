"""Résumé assistant — review (suggestions/score) + prompt-controlled revise."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.resume_assistant import ResumeAssistant
from jobsearch.models import JobPosting, Resume, ResumeSource


def _resume(text: str) -> Resume:
    return Resume(user_id="u1", source=ResumeSource.UPLOADED, rendered_text=text)


# --- engine: review ---------------------------------------------------------
def test_review_flags_missing_metrics_and_weak_verbs():
    r = _resume(
        "Experience\n- Responsible for the billing system\n- Worked on the API\n"
        "- Helped with deployments"
    )
    review = ResumeAssistant().review(r)
    cats = {s.category for s in review.suggestions}
    assert "impact" in cats  # weak verbs + no metrics
    titles = " ".join(s.title.lower() for s in review.suggestions)
    assert "action verb" in titles or "quantify" in titles
    assert 0 <= review.score <= 100
    assert review.word_count > 0
    assert review.summary


def test_review_rewards_strong_resume():
    r = _resume(
        "Summary\nSenior engineer.\nExperience\n"
        "- Led migration of billing to event-driven services, cutting p99 latency 40%\n"
        "- Drove a redesign that increased conversion 12% and saved $200k/yr\n"
        "- Built a data pipeline processing 5M events/day, mentoring 3 engineers\n"
        "Skills: Python, AWS, Kafka, leadership, distributed systems, mentoring."
    )
    review = ResumeAssistant().review(r)
    assert review.score >= 80
    assert review.strengths


def test_review_missing_keywords_from_job():
    r = _resume("- Led backend services in Python\n- Built REST APIs handling 2k req/s")
    job = JobPosting(title="Staff Engineer", company="Acme", requirements=["Python", "Rust", "Kubernetes"])
    review = ResumeAssistant().review(r, job=job)
    assert "Rust" in review.missing_keywords and "Kubernetes" in review.missing_keywords
    assert "Python" not in review.missing_keywords
    assert any(s.category == "keywords" for s in review.suggestions)


def test_review_empty_resume_safe():
    review = ResumeAssistant().review(_resume("   "))
    assert review.suggestions == [] and "No readable" in review.summary


# --- engine: revise ---------------------------------------------------------
def test_revise_returns_preview():
    r = _resume("- Responsible for the billing system\n- Worked on the API")
    rev = ResumeAssistant().revise(r, "Make it more concise and lead with strong verbs")
    assert rev.resume_id == r.id
    assert rev.instruction.startswith("Make it more concise")
    assert rev.preview  # non-empty rewrite


def test_revise_requires_instruction_and_text():
    r = _resume("- Some real content here")
    try:
        ResumeAssistant().revise(r, "  ")
        assert False
    except ValueError:
        pass
    try:
        ResumeAssistant().revise(_resume(""), "tidy it up")
        assert False
    except ValueError:
        pass


# --- API --------------------------------------------------------------------
def _auth(client, email="ra@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "RA"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _upload(client, h, text):
    return client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.md", text.encode(), "text/markdown")},
    ).json()


def test_api_review_and_revise_flow():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Responsible for the billing system\n- Worked on the API")
    rid = res["id"]

    rev = client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={})
    assert rev.status_code == 200
    body = rev.json()
    assert body["resume_id"] == rid and 0 <= body["score"] <= 100
    assert isinstance(body["suggestions"], list) and body["summary"]

    r = client.post(f"/api/v1/resumes/{rid}/revise", headers=h, json={"instruction": "Make it punchier"})
    assert r.status_code == 200
    prev = r.json()["preview"]
    assert prev
    # apply the preview via the existing update endpoint (human-in-the-loop)
    upd = client.put(f"/api/v1/resumes/{rid}", headers=h, json={"rendered_text": prev})
    assert upd.status_code == 200 and upd.json()["rendered_text"] == prev


def test_api_revise_empty_instruction_400():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Some content")
    r = client.post(f"/api/v1/resumes/{res['id']}/revise", headers=h, json={"instruction": "   "})
    assert r.status_code == 400


def test_api_review_requires_auth_and_ownership():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.post("/api/v1/resumes/nope/review", json={}).status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    res = _upload(client, ha, "- A's resume content")
    assert client.post(f"/api/v1/resumes/{res['id']}/review", headers=hb, json={}).status_code == 404
