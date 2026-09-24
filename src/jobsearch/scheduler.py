"""Agent tick — run everything that's due, for all users. Cron this on the host:

    # every 15 min, inside the api container
    */15 * * * *  docker compose exec -T api python -m jobsearch.scheduler

It runs due **auto-apply grants** (auto grants submit within their limits;
assisted/LinkedIn grants just refresh their apply queue) and due **saved
searches** (ingest fresh postings). Idempotent and safe to run often — each item
has its own cadence and only fires when its interval has elapsed.
"""

from __future__ import annotations

import sys

from jobsearch.api.state import AppState


def run_once(state: AppState) -> dict:
    # Auto-apply grants across all users (the engine spans users when user_id=None).
    runs = state.auto_apply.run_due(None)
    submitted = sum(r.submitted for r in runs)
    queued = sum(1 for r in runs for o in r.outcomes if o.status == "queued")

    # Saved searches are per-user; iterate the user set.
    searches_run = 0
    for user in state.users.all():
        searches_run += len(state.saved_search.run_due(user.id))

    # Out-of-band review reminders for users past their checkpoint + daily digests.
    reminders_sent = len(state.reminders.run_due_reminders())
    digests_sent = len(state.reminders.run_due_digests())

    summary = {
        "grants_run": len(runs),
        "submitted": submitted,
        "queued": queued,
        "searches_run": searches_run,
        "reminders_sent": reminders_sent,
        "digests_sent": digests_sent,
    }
    # Record a heartbeat so the web service can report the worker's liveness (the
    # worker has no HTTP endpoint of its own). Never let this break a tick.
    try:
        from jobsearch.models import WorkerHeartbeat
        from jobsearch.models.common import utcnow

        prev = state.worker_heartbeat.get("worker")
        state.worker_heartbeat.add(WorkerHeartbeat(
            id="worker", last_tick_at=utcnow(), last_summary=summary,
            ticks=(prev.ticks + 1) if prev else 1, updated_at=utcnow(),
        ))
    except Exception:  # noqa: BLE001
        pass
    return summary


async def run_periodically(state: AppState, *, interval_seconds: int, stop) -> None:
    """In-process scheduler loop: run everything due every ``interval_seconds``
    until ``stop`` is set. Each tick runs off the event loop (blocking work in a
    thread) and never raises into the loop. Used by the API's lifespan so a
    single web process fires scheduled grants with no external cron."""
    import asyncio
    import logging

    log = logging.getLogger("jobsearch.scheduler")
    interval = max(30, int(interval_seconds))
    while not stop.is_set():
        try:
            summary = await asyncio.to_thread(run_once, state)
            if summary.get("grants_run") or summary.get("searches_run"):
                log.info("scheduler tick: %s", summary)
        except Exception:  # noqa: BLE001 - a bad tick must not kill the loop
            log.exception("scheduler tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass


def run_worker() -> int:  # pragma: no cover - long-running process
    """Entrypoint for the standalone automation worker service: run the scheduler
    loop continuously until SIGTERM/SIGINT. This is the ONE process that performs
    real browser submissions (its image has Playwright + Chromium); the web
    service stays lean and only ever simulates. Run it as its own Railway service
    (`python -m jobsearch.worker`) sharing the same Postgres + encryption key."""
    import asyncio
    import logging
    import signal

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    log = logging.getLogger("jobsearch.worker")
    state = AppState()
    interval = state.settings.scheduler_interval_seconds
    log.info("automation worker up — ticking every %ss (browser=%s, live_submit=%s)",
             interval, state.settings.assistant_browser, state.settings.auto_apply_live_submit)

    async def _serve() -> None:
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, stop.set)
            except NotImplementedError:  # Windows
                pass
        await run_periodically(state, interval_seconds=interval, stop=stop)

    asyncio.run(_serve())
    log.info("automation worker stopped")
    return 0


def main() -> int:
    summary = run_once(AppState())
    print(
        f"scheduler: {summary['grants_run']} grant(s) run — "
        f"{summary['submitted']} submitted, {summary['queued']} queued; "
        f"{summary['searches_run']} saved search(es) run; "
        f"{summary['reminders_sent']} reminder(s), {summary['digests_sent']} digest(s) sent."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
