"""Saved jobs (bookmarks) — real backend replacing localStorage."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="sj@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "S"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _a_job(client, h):
    client.post("/api/v1/job-search/run", headers=h, json={"role": "dev", "location": "NYC", "remote": True})
    return client.get("/api/v1/jobs", headers=h).json()[0]["id"]


def test_save_list_unsave():
    client = _client()
    h = _auth(client)
    jid = _a_job(client, h)

    # save
    r = client.post("/api/v1/jobs/saved", headers=h, json={"job_posting_id": jid})
    assert r.status_code == 201 and r.json()["job_posting_id"] == jid

    # list returns the full posting
    saved = client.get("/api/v1/jobs/saved", headers=h).json()
    assert len(saved) == 1 and saved[0]["id"] == jid and saved[0]["title"]

    # dashboard reflects the saved count
    assert client.get("/api/v1/dashboard/summary", headers=h).json()["saved_jobs"] == 1

    # unsave
    assert client.delete(f"/api/v1/jobs/saved/{jid}", headers=h).status_code == 204
    assert client.get("/api/v1/jobs/saved", headers=h).json() == []
    assert client.get("/api/v1/dashboard/summary", headers=h).json()["saved_jobs"] == 0


def test_save_is_idempotent():
    client = _client()
    h = _auth(client)
    jid = _a_job(client, h)
    client.post("/api/v1/jobs/saved", headers=h, json={"job_posting_id": jid})
    client.post("/api/v1/jobs/saved", headers=h, json={"job_posting_id": jid, "note": "great fit"})
    saved = client.get("/api/v1/jobs/saved", headers=h).json()
    assert len(saved) == 1  # not duplicated


def test_reorder_saved_jobs_persists_order():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/job-search/run", headers=h, json={"role": "engineer", "location": "NYC", "remote": True})
    ids = [j["id"] for j in client.get("/api/v1/jobs", headers=h).json()][:3]
    assert len(ids) == 3
    for jid in ids:
        client.post("/api/v1/jobs/saved", headers=h, json={"job_posting_id": jid})

    # reorder to the reverse of insertion
    want = list(reversed(ids))
    r = client.put("/api/v1/jobs/saved/reorder", headers=h, json={"ids": want})
    assert r.status_code == 200
    assert [j["id"] for j in r.json()] == want
    # and a fresh GET reflects the persisted order (cross-device)
    assert [j["id"] for j in client.get("/api/v1/jobs/saved", headers=h).json()] == want


def test_save_unknown_job_404_and_unsave_missing_404():
    client = _client()
    h = _auth(client)
    assert client.post("/api/v1/jobs/saved", headers=h, json={"job_posting_id": "nope"}).status_code == 404
    assert client.delete("/api/v1/jobs/saved/nope", headers=h).status_code == 404


def test_saved_jobs_owner_scoped_and_auth():
    client = _client()
    assert client.get("/api/v1/jobs/saved").status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    jid = _a_job(client, ha)
    client.post("/api/v1/jobs/saved", headers=ha, json={"job_posting_id": jid})
    assert client.get("/api/v1/jobs/saved", headers=hb).json() == []
    assert client.delete(f"/api/v1/jobs/saved/{jid}", headers=hb).status_code == 404
