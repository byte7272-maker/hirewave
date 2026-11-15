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


def test_current_is_the_most_recently_edited_not_the_newest_created():
    # The one the user actively edits (newest VERSION) is current, even if another résumé
    # was created later — fixes "defaulted to the unused weak-test résumé".
    from jobsearch.models import DocumentVersion
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    now = utcnow()
    edited = Resume(user_id=uid, target_role="IT Director", created_at=now - timedelta(days=10))
    edited.versions = [DocumentVersion(version=1, content="orig", created_at=now - timedelta(days=10)),
                       DocumentVersion(version=2, content="edited", created_at=now)]  # fresh edit
    edited.active_version = 2
    st.resumes.add(edited)
    st.resumes.add(Resume(user_id=uid, target_role="weak test", created_at=now - timedelta(days=1)))  # newer, unused
    out = c.get("/api/v1/resumes", headers=h).json()
    assert out[0]["target_role"] == "IT Director"  # most recently edited is current


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


# --- primary résumé: an explicit choice that overrides recency ------------------
def test_set_primary_overrides_recency_in_listing():
    # The reported bug: a NEWER (test/sample-ish) résumé steals "current". Pinning the
    # real one as primary makes it current regardless of which was edited last.
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    now = utcnow()
    older = Resume(user_id=uid, target_role="My Real Résumé", created_at=now - timedelta(days=30))
    st.resumes.add(older)
    st.resumes.add(Resume(user_id=uid, target_role="Newer Test", created_at=now))
    # default (nothing pinned) keeps the recency behavior: newest is current
    assert c.get("/api/v1/resumes", headers=h).json()[0]["target_role"] == "Newer Test"
    # pin the older, real one -> it becomes current and the other is cleared
    r = c.post(f"/api/v1/resumes/{older.id}/set-primary", headers=h)
    assert r.status_code == 200 and r.json()["is_primary"] is True
    out = c.get("/api/v1/resumes", headers=h).json()
    assert out[0]["target_role"] == "My Real Résumé" and out[0]["is_primary"] is True
    assert all(rr["target_role"] != "Newer Test" or rr["is_primary"] is False for rr in out)


def test_primary_endpoint_returns_pinned_resume():
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    st.resumes.add(Resume(user_id=uid, target_role="A"))
    b = Resume(user_id=uid, target_role="B")
    st.resumes.add(b)
    c.post(f"/api/v1/resumes/{b.id}/set-primary", headers=h)
    prim = c.get("/api/v1/resumes/primary", headers=h).json()
    assert prim["id"] == b.id and prim["is_primary"] is True


def test_sole_real_resume_is_auto_primary():
    c, st = _client()
    h = _auth(c)
    uid = _uid(st)
    only = Resume(user_id=uid, target_role="Only Real")
    st.resumes.add(only)
    out = c.get("/api/v1/resumes", headers=h).json()  # triggers ensure_primary
    assert len(out) == 1 and out[0]["is_primary"] is True


def test_set_primary_rejects_another_users_resume():
    c, st = _client()
    h = _auth(c)
    c.post("/api/v1/auth/register", json={"email": "z@x.com", "password": "supersecret", "full_name": "Z"})
    tokz = c.post("/api/v1/auth/login", json={"email": "z@x.com", "password": "supersecret"}).json()
    hz = {"Authorization": f"Bearer {tokz['access_token']}"}
    mine = Resume(user_id=_uid(st), target_role="Mine")
    st.resumes.add(mine)
    assert c.post(f"/api/v1/resumes/{mine.id}/set-primary", headers=hz).status_code == 404
