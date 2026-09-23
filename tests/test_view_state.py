"""View state -- pages remember where the user was (selection, tab, filters)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="vs@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "VS"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_empty_by_default():
    c = _client()
    h = _auth(c)
    assert c.get("/api/v1/view-state/resumes", headers=h).json() == {}
    assert c.get("/api/v1/view-state", headers=h).json() == {"states": {}}


def test_save_and_restore_a_view():
    c = _client()
    h = _auth(c)
    body = {"selectedId": "res_123", "tab": "flagged", "filters": {"role": "Data Engineer"}, "scrollY": 640}
    put = c.put("/api/v1/view-state/resumes", headers=h, json=body)
    assert put.status_code == 200 and put.json() == body
    # survives a fresh fetch (persisted, not just in-request)
    assert c.get("/api/v1/view-state/resumes", headers=h).json() == body


def test_views_are_independent_and_listed_together():
    c = _client()
    h = _auth(c)
    c.put("/api/v1/view-state/resumes", headers=h, json={"selectedId": "res_1"})
    c.put("/api/v1/view-state/matches", headers=h, json={"filters": {"remote": True}, "scrollY": 120})
    states = c.get("/api/v1/view-state", headers=h).json()["states"]
    assert set(states) == {"resumes", "matches"}
    assert states["matches"]["filters"]["remote"] is True


def test_update_replaces_the_blob():
    c = _client()
    h = _auth(c)
    c.put("/api/v1/view-state/matches", headers=h, json={"tab": "all"})
    c.put("/api/v1/view-state/matches", headers=h, json={"tab": "saved", "scrollY": 50})
    assert c.get("/api/v1/view-state/matches", headers=h).json() == {"tab": "saved", "scrollY": 50}


def test_clear_one_view():
    c = _client()
    h = _auth(c)
    c.put("/api/v1/view-state/resumes", headers=h, json={"selectedId": "res_9"})
    assert c.delete("/api/v1/view-state/resumes", headers=h).status_code == 204
    assert c.get("/api/v1/view-state/resumes", headers=h).json() == {}


def test_rejects_bad_view_name_and_oversized_blob():
    c = _client()
    h = _auth(c)
    assert c.put("/api/v1/view-state/Bad Name", headers=h, json={"x": 1}).status_code == 400
    assert c.get("/api/v1/view-state/UPPER", headers=h).status_code == 400
    big = {"blob": "x" * 9000}  # over the 8 KB cap
    assert c.put("/api/v1/view-state/resumes", headers=h, json=big).status_code == 413


def test_owner_scoped_and_requires_auth():
    c = _client()
    assert c.get("/api/v1/view-state/resumes").status_code == 401
    ha = _auth(c, "a@demo.com")
    hb = _auth(c, "b@demo.com")
    c.put("/api/v1/view-state/resumes", headers=ha, json={"selectedId": "res_a"})
    assert c.get("/api/v1/view-state/resumes", headers=hb).json() == {}  # B doesn't see A's


# --- recently viewed (jump-back-in rail) ------------------------------------
def test_recently_viewed_empty_then_records_most_recent_first():
    c = _client()
    h = _auth(c)
    assert c.get("/api/v1/recently-viewed", headers=h).json() == []
    c.post("/api/v1/recently-viewed", headers=h,
           json={"kind": "resume", "ref_id": "res_1", "title": "Data Engineer CV", "view": "resumes"})
    rail = c.post("/api/v1/recently-viewed", headers=h,
                  json={"kind": "match", "ref_id": "job_9", "title": "Senior DE at Acme", "view": "matches"}).json()
    assert [v["ref_id"] for v in rail] == ["job_9", "res_1"]  # newest first
    assert rail[0]["kind"] == "match" and rail[0]["view"] == "matches"


def test_recently_viewed_dedupes_and_promotes():
    c = _client()
    h = _auth(c)
    c.post("/api/v1/recently-viewed", headers=h, json={"kind": "resume", "ref_id": "res_1"})
    c.post("/api/v1/recently-viewed", headers=h, json={"kind": "resume", "ref_id": "res_2"})
    rail = c.post("/api/v1/recently-viewed", headers=h,
                  json={"kind": "resume", "ref_id": "res_1", "title": "Updated"}).json()
    # res_1 reopened -> single entry, moved to the front with refreshed title
    assert [v["ref_id"] for v in rail] == ["res_1", "res_2"]
    assert rail[0]["title"] == "Updated"


def test_recently_viewed_filter_and_clear():
    c = _client()
    h = _auth(c)
    c.post("/api/v1/recently-viewed", headers=h, json={"kind": "resume", "ref_id": "res_1"})
    c.post("/api/v1/recently-viewed", headers=h, json={"kind": "match", "ref_id": "job_9"})
    only = c.get("/api/v1/recently-viewed?kind=resume", headers=h).json()
    assert [v["ref_id"] for v in only] == ["res_1"]
    assert c.delete("/api/v1/recently-viewed", headers=h).status_code == 204
    assert c.get("/api/v1/recently-viewed", headers=h).json() == []


def test_recently_viewed_requires_kind_and_auth():
    c = _client()
    assert c.get("/api/v1/recently-viewed").status_code == 401
    h = _auth(c)
    assert c.post("/api/v1/recently-viewed", headers=h, json={"kind": "", "ref_id": "x"}).status_code == 400
