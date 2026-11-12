"""GET /resumes must surface the user's CURRENT real résumé first and hide seeded
samples once a real one exists — so 'show/edit my résumé' never lands on a sample."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import Resume
from jobsearch.models.common import utcnow


def _client():
    st = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    return TestClient(create_app(state=st)), st


def _auth(c):
    c.post("/api/v1/auth/register", json={"email": "r@x.com", "password": "supersecret", "full_name": "R"})
    tok = c.post("/api/v1/auth/login", json={"email": "r@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _uid(st):
    return st.user_by_email("r@x.com").id


def test_sample_hidden_and_current_first_when_a_real_resume_exists():
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    now = utcnow()
    # a seeded sample created first, then the user's real résumés
    st.resumes.add(Resume(user_id=uid, is_sample=True, created_at=now - timedelta(days=5)))
    st.resumes.add(Resume(user_id=uid, created_at=now - timedelta(days=2)))
    st.resumes.add(Resume(user_id=uid, created_at=now))  # newest real = current

    out = c.get("/api/v1/resumes", headers=h).json()
    assert all(not r["is_sample"] for r in out)            # sample hidden
    assert len(out) == 2
    # newest real résumé is first (the current one)
    assert out[0]["created_at"] >= out[1]["created_at"]


def test_sample_shown_when_user_has_no_real_resume():
    # Registration seeds a sample résumé; a brand-new account (no real résumé) still sees it.
    c, st = _client()
    h = _auth(c)
    out = c.get("/api/v1/resumes", headers=h).json()
    assert out and all(r["is_sample"] for r in out)


def test_include_sample_opt_in():
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    st.resumes.add(Resume(user_id=uid))  # one real résumé (sample is the seeded one)
    default = c.get("/api/v1/resumes", headers=h).json()
    assert default and all(not r["is_sample"] for r in default)  # seeded sample hidden
    withs = c.get("/api/v1/resumes", headers=h, params={"include_sample": True}).json()
    assert any(r["is_sample"] for r in withs)
    assert len(withs) == len(default) + 1  # the hidden seeded sample reappears
