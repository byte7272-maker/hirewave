"""In-process scheduler — runs due grants/searches on a cadence (no cron needed)."""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import AutoApplyCriteria, JobPosting, User
from jobsearch.models.common import utcnow
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


def test_cipher_canary_flags_key_mismatch(tmp_path, caplog):
    import logging
    from jobsearch.security.crypto import generate_key

    db = "sqlite:///" + str(tmp_path / "canary.db").replace("\\", "/")
    k1, k2 = generate_key(), generate_key()
    # First boot writes the canary with k1.
    AppState(settings=Settings(database_url=db, encryption_key=k1), exchanger=MockTokenExchanger())
    # Same key -> decrypts fine -> no mismatch error.
    with caplog.at_level(logging.ERROR, logger="jobsearch"):
        AppState(settings=Settings(database_url=db, encryption_key=k1), exchanger=MockTokenExchanger())
    assert not any("KEY MISMATCH" in r.message for r in caplog.records)
    caplog.clear()
    # Different key -> can't decrypt the shared canary -> loud error.
    with caplog.at_level(logging.ERROR, logger="jobsearch"):
        AppState(settings=Settings(database_url=db, encryption_key=k2), exchanger=MockTokenExchanger())
    assert any("KEY MISMATCH" in r.message for r in caplog.records)


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


# --- JD enrichment pass (A: backoff/stats, B: inference) ----------------------

class _Live:  # a stand-in LIVE fetcher so enrich_descriptions actually runs offline
    live = True


class _FakeLLM:
    name = "fake"

    def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
        return ('{"description": "Own the platform, lead incident response and mentor '
                'engineers across regions in a fast-moving team.", '
                '"requirements": ["AWS", "Terraform", "Python", "On-call ownership"]}')


def _needs_jd_job(jid="j1", source="linkedin", url="https://www.linkedin.com/jobs/view/1"):
    return JobPosting(
        id=jid, title="SRE", company="Acme", source_platform=source, url=url,
        description="SRE — surfaced from a job_alert email in your connected inbox.",
    )


def test_enrich_descriptions_is_noop_offline():
    # Mock (non-live) fetcher -> the pass never hits the wire; empty stats.
    from jobsearch.scheduler import enrich_descriptions

    state = _state()
    state.jobs.add(_needs_jd_job())
    stats = enrich_descriptions(state)
    assert stats == {"enriched": 0, "attempted": 0, "blocked": 0, "inferred": 0, "by_source": {}}


def test_enrich_descriptions_tallies_by_source(monkeypatch):
    import jobsearch.engines.sourcing.jd_enrich as je
    from jobsearch.scheduler import enrich_descriptions

    # A real JD comes back for this page -> it enriches and is tallied under its source.
    monkeypatch.setattr(je, "fetch_jd", lambda url, timeout=12.0: {
        "description": "Own the fleet and ship reliably at scale. " * 8,
        "requirements": ["AWS", "Terraform"],
    })
    state = _state()
    state.gmail_fetcher = _Live()
    state.jobs.add(_needs_jd_job())
    stats = enrich_descriptions(state)
    assert stats["attempted"] == 1 and stats["enriched"] == 1
    assert stats["by_source"]["linkedin"]["enriched"] == 1


def test_enrich_job_infers_a_labeled_jd_after_parking(monkeypatch):
    # The dominant real-world case: the page can't be fetched (bot-wall). After the
    # backoff exhausts and the job is parked, inference writes a labeled JD (B).
    from datetime import timedelta

    import jobsearch.engines.sourcing.jd_enrich as je

    monkeypatch.setattr(je, "fetch_jd", lambda url, timeout=12.0: {})
    llm = _FakeLLM()
    job = _needs_jd_job()
    base = utcnow()

    # Attempts 1-3 fail and do NOT infer (not parked yet).
    for i in range(3):
        assert je.enrich_job(job, now=base + timedelta(hours=1000 * i), llm=llm, infer=True) is False
        assert job.description_inferred is False
    # 4th attempt parks it -> inference kicks in with a clearly-labeled body.
    assert je.enrich_job(job, now=base + timedelta(hours=9000), llm=llm, infer=True) is True
    assert job.jd_blocked is True
    assert job.description_inferred is True
    assert "Estimated role description" in job.description


def test_enrich_job_without_inference_just_parks(monkeypatch):
    from datetime import timedelta

    import jobsearch.engines.sourcing.jd_enrich as je

    monkeypatch.setattr(je, "fetch_jd", lambda url, timeout=12.0: {})
    job = _needs_jd_job()
    base = utcnow()
    for i in range(4):
        je.enrich_job(job, now=base + timedelta(hours=1000 * i), infer=False)
    assert job.jd_blocked is True
    assert job.description_inferred is False  # no inference without the flag
