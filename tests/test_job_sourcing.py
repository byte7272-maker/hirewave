"""Multi-site job sourcing agent — sources, aggregation, saved searches, API."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.sourcing import JobAggregator, JobQuery, MockJobSource, SavedSearchEngine
from jobsearch.engines.verification import VerificationEngine
from jobsearch.models import Notification
from jobsearch.models.common import utcnow
from jobsearch.store import InMemoryRepository


# --- sources + aggregation --------------------------------------------------
def _aggregator():
    jobs = InMemoryRepository(id_attr="id")
    verifications: dict = {}
    agg = JobAggregator([MockJobSource()], jobs, VerificationEngine(), verifications)
    return agg, jobs, verifications


def test_mock_source_returns_multi_board_with_dup_and_scam():
    rows = MockJobSource().search(JobQuery(role="Backend Engineer"))
    boards = {r["source_platform"] for r in rows}
    assert len(boards) >= 3  # spread across several job boards
    assert any(r["company"] == "QuickCash Global" for r in rows)  # a scam to filter


def test_aggregate_dedupes_and_hides_scam():
    agg, jobs, verifications = _aggregator()
    r = agg.search(JobQuery(role="Backend Engineer", location="Remote"))
    assert r.found > r.ingested  # the cross-board duplicate collapsed
    assert r.hidden == 1  # the scam posting was auto-hidden
    # every ingested job is stored
    assert len(jobs.all()) == r.ingested
    hidden_ids = [jid for jid in r.job_ids if verifications[jid].display_action == "hidden"]
    assert len(hidden_ids) == 1


def test_repeat_search_skips_already_stored():
    agg, _, _ = _aggregator()
    agg.search(JobQuery(role="Backend Engineer", location="Remote"))
    second = agg.search(JobQuery(role="Backend Engineer", location="Remote"))
    assert second.ingested == 0
    assert second.duplicates > 0


# --- saved searches ---------------------------------------------------------
def _saved_engine():
    agg, jobs, _ = _aggregator()
    profiles = InMemoryRepository(id_attr="user_id")
    notes: list[Notification] = []
    eng = SavedSearchEngine(
        aggregator=agg, matching=MatchingEngine(), profiles=profiles,
        notifier=notes.append,
    )
    return eng, notes


def test_saved_search_run_ingests_and_notifies():
    eng, notes = _saved_engine()
    s = eng.create("u1", role="Data Scientist", interval_minutes=60)
    result = eng.run(s)
    assert result.ingested > 0
    assert s.last_run_at is not None
    assert s.last_new_count == result.ingested - result.hidden
    assert notes and "new role" in notes[0].message
    assert notes[0].type.value == "match_found"


def test_due_respects_interval():
    eng, _ = _saved_engine()
    s = eng.create("u1", role="Data Scientist", interval_minutes=60)
    t0 = utcnow()
    assert s in eng.due("u1", now=t0)  # never run → due
    eng.run(s, now=t0)
    assert s not in eng.due("u1", now=t0 + timedelta(minutes=30))  # not yet
    assert s in eng.due("u1", now=t0 + timedelta(minutes=61))  # due again


def test_inactive_search_not_due():
    eng, _ = _saved_engine()
    s = eng.create("u1", role="PM")
    eng.set_active(s.id, "u1", False)
    assert eng.due("u1", now=utcnow() + timedelta(days=2)) == []


def test_owner_scoped():
    eng, _ = _saved_engine()
    s = eng.create("u1", role="PM")
    assert eng.get(s.id, "u2") is None
    assert eng.delete(s.id, "u2") is False


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_run_ingests_into_matches():
    client = _client()
    h = _auth(client)
    r = client.post("/api/v1/job-search/run", headers=h, json={"role": "Backend Engineer", "remote": True})
    assert r.status_code == 200
    body = r.json()
    assert body["ingested"] > 0 and body["hidden"] == 1
    assert len(body["sources"]) >= 3
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    assert len(matches) == body["ingested"] - body["hidden"]  # scam excluded from matches
    # each match carries a direct link + card fields so the user can open the posting
    m = matches[0]
    assert m["url"].startswith("http")
    assert "location" in m and "remote" in m and "posted_ago" in m and "source_platform" in m


def test_repeat_search_reports_matched_jobs_not_empty():
    # A repeat search of an already-ingested role ingests 0 new (global dedup) but
    # must still report the jobs it surfaced via matched_job_ids (so the UI isn't
    # falsely "empty").
    client = _client()
    h = _auth(client)
    first = client.post("/api/v1/job-search/run", headers=h, json={"role": "IT operations director", "remote": True}).json()
    assert first["ingested"] > 0
    assert len(first["matched_job_ids"]) == first["ingested"] + first["duplicates"]
    second = client.post("/api/v1/job-search/run", headers=h, json={"role": "IT operations director", "remote": True}).json()
    assert second["ingested"] == 0  # nothing net-new
    assert len(second["matched_job_ids"]) > 0  # but the roles are still surfaced


def test_api_saved_search_crud_and_run():
    client = _client()
    h = _auth(client)
    created = client.post("/api/v1/job-search/searches", headers=h, json={"role": "Data Scientist", "interval_minutes": 30})
    assert created.status_code == 201
    sid = created.json()["id"]
    assert len(client.get("/api/v1/job-search/searches", headers=h).json()) == 1
    run = client.post(f"/api/v1/job-search/searches/{sid}/run", headers=h)
    assert run.status_code == 200 and run.json()["ingested"] > 0
    # pausing removes it from the "due" set
    client.put(f"/api/v1/job-search/searches/{sid}", headers=h, json={"active": False})
    assert client.post("/api/v1/job-search/run-due", headers=h).json() == []
    assert client.delete(f"/api/v1/job-search/searches/{sid}", headers=h).status_code == 204


def test_api_search_route_does_not_collide_with_job_id():
    client = _client()
    h = _auth(client)
    # /job-search/run must not be swallowed by /jobs/{job_id}
    assert client.post("/api/v1/job-search/run", headers=h, json={"role": "x"}).status_code == 200


def test_api_run_requires_auth():
    client = _client()
    assert client.post("/api/v1/job-search/run", json={"role": "x"}).status_code == 401
