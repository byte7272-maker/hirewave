"""Crowdsourced interview questions — engine + API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import CommunityQuestionEngine
from jobsearch.models import QuestionCategory


# --- engine -----------------------------------------------------------------
def _seed() -> CommunityQuestionEngine:
    e = CommunityQuestionEngine()
    e.submit(user_id="u1", job_title="Senior Backend Engineer",
             question="Design a rate limiter for a public API.", category=QuestionCategory.TECHNICAL)
    e.submit(user_id="u2", job_title="Backend Engineer",
             question="Tell me about a production incident you owned.", category=QuestionCategory.EXPERIENCE)
    e.submit(user_id="u3", job_title="Product Designer",
             question="Walk me through your end-to-end design process.", category=QuestionCategory.BEHAVIORAL)
    return e


def test_search_ranks_relevant_titles_only():
    e = _seed()
    titles = [q.job_title for q in e.search("backend engineer", limit=10)]
    assert "Product Designer" not in titles
    assert set(titles) == {"Senior Backend Engineer", "Backend Engineer"}


def test_exact_title_match_ranks_first():
    e = _seed()
    top = e.search("Senior Backend Engineer", limit=10)[0]
    assert top.job_title == "Senior Backend Engineer"


def test_submit_dedupes_identical_question():
    e = _seed()
    before = len(e.repo.all())
    merged = e.submit(user_id="u9", job_title="senior backend engineer",
                      question="Design a rate limiter for a public API",  # same, case/punct differ
                      category=QuestionCategory.TECHNICAL)
    assert len(e.repo.all()) == before
    assert merged.user_id == "u1"  # returns the original


def test_short_question_rejected():
    e = CommunityQuestionEngine()
    try:
        e.submit(user_id="u1", job_title="X", question="short")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_category_filter():
    e = _seed()
    tech = e.search("backend engineer", category=QuestionCategory.TECHNICAL, limit=10)
    assert all(q.category == QuestionCategory.TECHNICAL for q in tech)
    assert len(tech) == 1


def test_vote_toggles_once_per_user():
    e = _seed()
    q = e.search("backend engineer")[0]
    e.vote(q.id, "a"); e.vote(q.id, "b")
    assert e.repo.get(q.id).votes == 2
    e.vote(q.id, "a")  # unvote
    assert e.repo.get(q.id).votes == 1


def test_flag_auto_hides_at_threshold():
    e = _seed()
    q = e.search("backend engineer")[0]
    for voter in ("a", "b", "c"):
        e.flag(q.id, voter)
    remaining = [x.id for x in e.search("backend engineer", limit=10)]
    assert q.id not in remaining  # 3 flags → hidden


def test_questions_for_interview_maps_to_plan():
    e = _seed()
    qs = e.questions_for_interview("backend engineer", limit=5)
    assert qs and all(hasattr(q, "question") for q in qs)


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email: str = "a@b.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_submit_search_vote_flow():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/questions", headers=h, json={
        "job_title": "Data Scientist", "question": "How do you prevent target leakage in a model?",
        "category": "technical"})
    assert r.status_code == 201
    q = r.json()
    assert q["mine"] is True and q["voted"] is False and "voter_ids" not in q

    # another user searches and finds it
    h2 = _auth(client, "b@c.com")
    found = client.get("/api/v1/questions/search", headers=h2, params={"job_title": "data scientist"}).json()
    assert any(x["question"].startswith("How do you prevent target leakage") for x in found)
    assert found[0]["mine"] is False

    voted = client.post(f"/api/v1/questions/{q['id']}/vote", headers=h2).json()
    assert voted["votes"] == 1 and voted["voted"] is True


def test_api_mine_lists_own_submissions():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/questions", headers=h, json={"job_title": "PM", "question": "How do you prioritise a roadmap?"})
    mine = client.get("/api/v1/questions/mine", headers=h).json()
    assert len(mine) == 1 and mine[0]["mine"] is True


def test_api_start_interview_with_crowdsourced_questions():
    client = _client()
    h = _auth(client)
    plan = ["Design a rate limiter.", "Describe your hardest production bug."]
    session = client.post("/api/v1/interview/mock/start", headers=h, json={
        "questions": plan, "max_questions": 2}).json()
    assert session["plan"] == plan
    assert session["turns"][0]["question"] == plan[0]


def test_api_search_requires_auth():
    client = _client()
    assert client.get("/api/v1/questions/search", params={"job_title": "x"}).status_code == 401
