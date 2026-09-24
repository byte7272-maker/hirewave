"""In-process scheduler — runs due grants/searches on a cadence (no cron needed)."""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import AutoApplyCriteria, JobPosting, User
from jobsearch.scheduler import run_once, run_periodically


def _state(**settings) -> AppState:
    return AppState(settings=Settings(**settings), exchanger=MockTokenExchanger())


def _seed(state: AppState):
    state.users.add(User(id="u1", email="u1@x.com", full_name="Ada", phone="555"))
    state.jobs.add(JobPosting(
        id="in1", title="Python Developer", company="Acme", location="Remote", remote=True,
        source_platform="indeed", url="https://jobs/in1", is_verified=True, match_score=80.0,
    ))


def test_run_once_fires_a_due_grant():
    state = _state()
    _seed(state)
    state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), interval_minutes=1)
    summary = run_once(state)
    assert summary["grants_run"] == 1
    assert [a.job_posting_id for a in state.applications.find(user_id="u1")] == ["in1"]


def test_run_periodically_ticks_then_stops():
    state = _state()
    _seed(state)
    state.auto_apply.create_grant("u1", criteria=AutoApplyCriteria(title_keywords=["python"]), interval_minutes=1)

    async def go():
        stop = asyncio.Event()
        task = asyncio.create_task(run_periodically(state, interval_seconds=30, stop=stop))
        await asyncio.sleep(0.2)  # let the immediate first tick run
        stop.set()
        await asyncio.wait_for(task, timeout=2)

    asyncio.run(go())
    # The due grant ran during the first tick -> the job was applied (simulated).
    assert [a.job_posting_id for a in state.applications.find(user_id="u1")] == ["in1"]


def test_run_once_records_a_heartbeat():
    state = _state()
    _seed(state)
    assert state.worker_heartbeat.get("worker") is None  # none before any tick
    run_once(state)
    hb = state.worker_heartbeat.get("worker")
    assert hb is not None and hb.ticks == 1 and hb.last_tick_at is not None
    run_once(state)
    assert state.worker_heartbeat.get("worker").ticks == 2  # increments per tick


def test_health_worker_never_then_ok():
    state = _state()
    _seed(state)
    client = TestClient(create_app(state=state))
    before = client.get("/health/worker").json()
    assert before["status"] == "never" and before["ticks"] == 0

    run_once(state)  # the worker ticks
    after = client.get("/health/worker").json()
    assert after["status"] == "ok"
    assert after["ticks"] == 1 and after["seconds_since"] is not None
    assert after["last_tick_at"] and "grants_run" in after["last_summary"]


def test_health_worker_reports_stale_when_old():
    from datetime import timedelta

    from jobsearch.models import WorkerHeartbeat
    from jobsearch.models.common import utcnow

    state = _state()
    client = TestClient(create_app(state=state))
    # A tick that happened long ago -> stale.
    state.worker_heartbeat.add(WorkerHeartbeat(
        id="worker", last_tick_at=utcnow() - timedelta(hours=6), ticks=5, last_summary={},
    ))
    body = client.get("/health/worker").json()
    assert body["status"] == "stale" and body["seconds_since"] > body["threshold_seconds"]


def test_worker_entrypoint_is_wired():
    import jobsearch.worker as worker
    from jobsearch.scheduler import run_worker

    # The worker module is the standalone entrypoint that runs the scheduler loop.
    assert worker.run_worker is run_worker and callable(run_worker)


def test_health_reports_scheduler_mode():
    external = TestClient(create_app(state=_state()))
    assert external.get("/health").json()["scheduler"] == "external"
    # Enabling the in-process scheduler is reflected on /health. (The lifespan
    # only starts the loop when the app is actually served, so this just checks
    # the reported mode, not a running loop.)
    in_proc = TestClient(create_app(state=_state(scheduler_enabled=True)))
    assert in_proc.get("/health").json()["scheduler"] == "in-process"
