"""SQL persistence tests against a real SQLite database (temp file).

Covers the repository CRUD contract, encrypted token storage through SQL, the
`find()` index guard, and — the real point — data surviving a simulated process
restart at the API level.
"""

from __future__ import annotations

import pytest

from jobsearch.config import Settings
from jobsearch.models import Provider, User
from jobsearch.persistence import SqlRepository, build_engine, create_schema
from jobsearch.persistence.tables import SPECS
from jobsearch.security.crypto import FieldCipher, generate_key
from jobsearch.store import TokenStore


def _engine(tmp_path, name="db.sqlite"):
    engine = build_engine(f"sqlite:///{(tmp_path / name).as_posix()}")
    create_schema(engine)
    return engine


def test_sql_repository_crud(tmp_path):
    repo: SqlRepository[User] = SqlRepository(_engine(tmp_path), SPECS["users"])
    u = User(email="a@b.com", full_name="Ada")
    repo.add(u)

    assert repo.get(u.id).email == "a@b.com"
    assert repo.find(email="a@b.com")[0].id == u.id
    assert repo.all()[0].id == u.id

    u.full_name = "Ada L."  # update = upsert by id
    repo.add(u)
    assert repo.get(u.id).full_name == "Ada L."
    assert len(repo.all()) == 1  # upsert, not a second row

    assert repo.delete(u.id) is True
    assert repo.get(u.id) is None
    assert repo.delete(u.id) is False


def test_find_rejects_unindexed_field(tmp_path):
    repo = SqlRepository(_engine(tmp_path), SPECS["users"])
    repo.add(User(email="x@y.com", full_name="X"))
    with pytest.raises(ValueError):
        repo.find(full_name="X")  # not a promoted/indexed column


def test_tokenstore_encrypts_through_sql(tmp_path):
    oauth_repo = SqlRepository(_engine(tmp_path), SPECS["oauth_tokens"])
    cipher = FieldCipher(generate_key())
    store = TokenStore(cipher, repo=oauth_repo)

    store.save(
        user_id="u1", provider=Provider.LINKEDIN, access_token="secret-tok", refresh_token="ref"
    )
    rec = store.get_record("u1", Provider.LINKEDIN)
    assert rec is not None
    assert rec.access_token.startswith("v1:")  # ciphertext persisted, not plaintext
    assert "secret-tok" not in rec.access_token
    assert store.reveal("u1", Provider.LINKEDIN) == ("secret-tok", "ref")
    assert [t.provider for t in store.list_providers("u1")] == [Provider.LINKEDIN]


def test_data_round_trips_complex_model(tmp_path):
    """Nested/list fields survive the JSON round-trip."""
    from jobsearch.models import UserProfile
    from jobsearch.models.user import JobPreferences, SalaryRange, WorkExperience

    repo = SqlRepository(_engine(tmp_path), SPECS["profiles"])
    prof = UserProfile(
        user_id="u9",
        headline="Engineer",
        skills=["Python", "AWS"],
        work_experience=[WorkExperience(company="Acme", title="SWE", highlights=["did things"])],
        preferences=JobPreferences(
            salary_range=SalaryRange(minimum=100, maximum=200), target_roles=["Backend"]
        ),
    )
    repo.add(prof)
    got = repo.get("u9")
    assert got.skills == ["Python", "AWS"]
    assert got.work_experience[0].company == "Acme"
    assert got.preferences.salary_range.maximum == 200


# --- end-to-end: survive a "restart" ---------------------------------------
MATCHING_JOB = {
    "source_platform": "linkedin",
    "title": "Senior Backend Engineer",
    "company": "Globex",
    "company_domain": "globex.com",
    "remote": True,
    "description": "Python FastAPI PostgreSQL AWS Kubernetes microservices 6+ years",
    "requirements": ["Python", "FastAPI", "PostgreSQL"],
    "url": "https://x/1",
}


def _settings(tmp_path, key):
    return Settings(
        database_url=f"sqlite:///{(tmp_path / 'app.sqlite').as_posix()}",
        encryption_key=key,
        llm_provider="mock",
        embedding_provider="mock",
        automation_mode="simulate",
    )


def _client(settings):
    from fastapi.testclient import TestClient

    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState
    from jobsearch.engines.integration import MockTokenExchanger

    state = AppState(settings=settings, exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def test_api_state_survives_restart(tmp_path):
    key = generate_key()  # fixed key so encrypted tokens decrypt after "restart"
    settings = _settings(tmp_path, key)

    # --- process 1: register, connect, ingest, prepare & submit -------------
    c1, state1 = _client(settings)
    assert state1.backend == "sqlite"
    assert c1.get("/health").json()["persistence"] == "sqlite"

    c1.post(
        "/api/v1/auth/register",
        json={"email": "sam@demo.com", "password": "supersecret", "full_name": "Sam"},
    )
    tok = c1.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}

    c1.put("/api/v1/users/me", headers=h, json={"skills": ["Python", "FastAPI", "PostgreSQL"]})
    c1.post("/api/v1/integrations/connect/linkedin", headers=h)  # stores encrypted token
    # complete the mock oauth so a token is persisted
    conn = c1.post("/api/v1/integrations/connect/linkedin", headers=h).json()
    c1.get(f"/api/v1/integrations/callback/linkedin?code=abc&state={conn['state']}")

    c1.post("/api/v1/jobs/ingest", headers=h, json={"jobs": [MATCHING_JOB]})
    job_id = c1.get("/api/v1/jobs/matches", headers=h).json()[0]["job_id"]
    resume = c1.post("/api/v1/resumes/generate", headers=h, json={"job_posting_id": job_id}).json()
    app = c1.post(
        "/api/v1/applications",
        headers=h,
        json={"job_posting_id": job_id, "resume_id": resume["id"]},
    ).json()
    c1.put(f"/api/v1/resumes/{resume['id']}", headers=h, json={"approved": True})
    submitted = c1.put(f"/api/v1/applications/{app['id']}/submit", headers=h, json={})
    assert submitted.status_code == 200 and submitted.json()["success"] is True

    # --- process 2: brand-new AppState on the same DB file -----------------
    c2, state2 = _client(settings)

    # User persisted → login works against process 2.
    tok2 = c2.post(
        "/api/v1/auth/login", json={"email": "sam@demo.com", "password": "supersecret"}
    ).json()
    h2 = {"Authorization": f"Bearer {tok2['access_token']}"}

    me = c2.get("/api/v1/users/me", headers=h2).json()
    assert me["email"] == "sam@demo.com"

    # Job + application + resume all survived.
    assert c2.get(f"/api/v1/jobs/{job_id}", headers=h2).status_code == 200
    apps = c2.get("/api/v1/applications", headers=h2).json()
    assert len(apps) == 1
    assert apps[0]["id"] == app["id"]
    assert apps[0]["status"] == "submitted"
    assert c2.get(f"/api/v1/resumes/{resume['id']}", headers=h2).json()["approved"] is True

    # Encrypted OAuth token persisted and still decryptable with the same key.
    conns = c2.get("/api/v1/integrations", headers=h2).json()
    assert any(c["provider"] == "linkedin" for c in conns)
    assert state2.integration.get_access_token(me["id"], Provider.LINKEDIN).startswith("mock-access")
