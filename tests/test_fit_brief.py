"""GET /api/v1/jobs/{job_id}/fit-brief — the grounded brief the assistant speaks
after it lands on Matches: fit score + verdict, why it fits, what to tailor, which
résumé + cover-letter set to use, and the related next steps to offer.

Everything is derived from the real match scoring and the user's own documents, so
the assistant never has to invent any of it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import JobPosting, UserProfile
from jobsearch.models.document import CoverLetter, Resume
from jobsearch.models.user import JobPreferences, SalaryRange


def _client_with_user(email="fit@demo.com"):
    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    client.post("/api/v1/auth/register",
                json={"email": email, "password": "supersecret12", "full_name": "F"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": email, "password": "supersecret12"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    uid = state.user_by_email(email).id
    # Ditch seeded sample jobs so the brief ranks against the user's own pool.
    for j in list(state.jobs.all()):
        if getattr(j, "is_sample", False):
            state.jobs.delete(j.id)
    # New accounts get a seeded sample résumé; drop it so each test controls its docs.
    for r in state.resumes.find(user_id=uid):
        state.resumes.delete(r.id)
    for cl in state.cover_letters.find(user_id=uid):
        state.cover_letters.delete(cl.id)
    return state, client, h, uid


def _seed_job(state, uid, **over) -> JobPosting:
    job = JobPosting(
        source_platform="linkedin", title="Senior Backend Engineer", company="Globex",
        owner_id=uid, location="Remote", remote=True,
        description="Senior Backend Engineer building Python microservices with FastAPI "
                    "on AWS and Kubernetes.",
        requirements=["Python", "FastAPI", "AWS", "Kubernetes"],
        salary_range=SalaryRange(minimum=160_000, maximum=210_000),
        **over,
    )
    state.jobs.add(job)
    return job


def test_fit_brief_recommends_the_stronger_resume_and_a_cover_letter():
    state, client, h, uid = _client_with_user()
    state.profiles.add(UserProfile(
        user_id=uid, headline="Senior Backend Engineer",
        skills=["Python", "FastAPI", "AWS", "Kubernetes"],
        preferences=JobPreferences(
            salary_range=SalaryRange(minimum=150_000, maximum=200_000),
            remote_ok=True, seniority="senior"),
    ))
    job = _seed_job(state, uid)

    # Two résumés: one squarely on-point, one off-topic. The brief must prefer the first.
    strong = Resume(user_id=uid, target_role="Backend Engineer",
                    rendered_text="Python FastAPI AWS Kubernetes microservices at scale, "
                                  "led backend teams, CI/CD, observability.")
    weak = Resume(user_id=uid, target_role="Graphic Designer",
                  rendered_text="Adobe Photoshop Illustrator branding typography print layout.")
    state.resumes.add(strong)
    state.resumes.add(weak)
    state.cover_letters.add(CoverLetter(
        user_id=uid, content="Dear team, I build Python FastAPI services on AWS and Kubernetes."))

    r = client.get(f"/api/v1/jobs/{job.id}/fit-brief", headers=h)
    assert r.status_code == 200, r.text
    b = r.json()

    assert b["job_id"] == job.id and b["company"] == "Globex"
    assert 0 <= b["score"] <= 100
    assert b["verdict"] in {"strong", "solid", "moderate", "stretch"}
    assert b["summary"]
    # recommends the stronger résumé over the off-topic one
    assert b["recommended_resume"]["id"] == strong.id
    assert {o["id"] for o in b["resume_options"]} == {strong.id, weak.id}
    assert b["resume_options"][0]["id"] == strong.id  # ranked best-first
    # a cover letter is recommended
    assert b["recommended_cover_letter"]["id"] is not None
    # the matching skills show up as positives; next steps are offered
    assert any("skill" in w.lower() for w in b["why_fits"])
    actions = {s["action"] for s in b["next_steps"]}
    assert "tailor_resume" in actions and "apply" in actions


def test_fit_brief_what_to_tailor_names_the_gaps():
    state, client, h, uid = _client_with_user(email="fit2@demo.com")
    state.profiles.add(UserProfile(
        user_id=uid, skills=["Python"], headline="Engineer",
        preferences=JobPreferences(remote_ok=True, seniority="mid")))
    # A résumé missing the cloud/orchestration requirements → those become tailor items.
    state.resumes.add(Resume(user_id=uid, target_role="Engineer",
                             rendered_text="Python developer building REST APIs."))
    job = _seed_job(state, uid)

    b = client.get(f"/api/v1/jobs/{job.id}/fit-brief", headers=h).json()
    tailor_blob = " ".join(b["what_to_tailor"]).lower()
    # at least one of the unmet requirements is surfaced as something to tailor
    assert any(k in tailor_blob for k in ("aws", "kubernetes", "fastapi"))
    assert b["what_to_tailor"], "there should be concrete tailoring moves"


def test_fit_brief_always_has_a_tailoring_move_even_for_a_sparse_job():
    # A posting with no mined requirements must still yield something to tailor —
    # the assistant should always be able to answer "what should I tailor?".
    state, client, h, uid = _client_with_user(email="fit5@demo.com")
    state.profiles.add(UserProfile(user_id=uid, skills=["Python"], headline="Eng"))
    state.resumes.add(Resume(user_id=uid, target_role="Engineer",
                             rendered_text="Experienced professional."))
    job = JobPosting(source_platform="linkedin", title="Technology", company="Acme LLP",
                     owner_id=uid, description="Technology role.", requirements=[])
    state.jobs.add(job)
    b = client.get(f"/api/v1/jobs/{job.id}/fit-brief", headers=h).json()
    assert b["what_to_tailor"], "there must always be at least one tailoring move"


def test_fit_brief_works_with_no_documents_yet():
    state, client, h, uid = _client_with_user(email="fit3@demo.com")
    state.profiles.add(UserProfile(user_id=uid, skills=["Python", "AWS"], headline="Eng"))
    job = _seed_job(state, uid)
    b = client.get(f"/api/v1/jobs/{job.id}/fit-brief", headers=h).json()
    assert 0 <= b["score"] <= 100
    assert b["recommended_resume"] is None
    assert b["resume_options"] == []
    # still offers to move forward (apply / save)
    assert {s["action"] for s in b["next_steps"]} >= {"apply", "save"}


def test_fit_brief_404_for_other_users_job():
    state, client, h, uid = _client_with_user(email="fit4@demo.com")
    # a job owned by somebody else must not be briefable
    other = JobPosting(source_platform="linkedin", title="X", company="Y",
                       owner_id="someone-else", description="d", requirements=[])
    state.jobs.add(other)
    r = client.get(f"/api/v1/jobs/{other.id}/fit-brief", headers=h)
    assert r.status_code == 404
