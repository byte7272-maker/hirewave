"""FastAPI application factory."""

from __future__ import annotations

import contextlib
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jobsearch.api.routers import (
    admin,
    applications,
    assistant,
    auth,
    authenticity,
    auto_apply,
    boards,
    community,
    dashboard,
    documents,
    experience,
    inbox,
    integrations,
    interview,
    jobs,
    monitoring,
    narration,
    notifications,
    onboarding,
    practice,
    screener,
    reminders,
    social,
    sourcing,
    templates,
    users,
    view_state,
    webrtc,
)
from jobsearch.api.state import AppState
from jobsearch.engines.integration import TokenExchanger

_ROUTERS = [
    auth.router,
    users.router,
    integrations.router,
    jobs.router,
    sourcing.router,
    documents.router,
    interview.router,
    community.router,
    experience.router,
    dashboard.router,
    authenticity.router,
    inbox.router,
    social.router,
    practice.router,
    webrtc.router,
    boards.router,
    assistant.router,
    auto_apply.router,
    screener.router,
    applications.router,
    monitoring.router,
    narration.router,
    notifications.router,
    onboarding.router,
    reminders.router,
    admin.router,
    templates.router,
    view_state.router,
    view_state.recent_router,
]


def create_app(
    *,
    state: Optional[AppState] = None,
    exchanger: Optional[TokenExchanger] = None,
    cors_origins: Optional[list[str]] = None,
) -> FastAPI:
    """Build the API. Pass a custom ``state``/``exchanger`` for tests."""
    app_state = state or AppState(exchanger=exchanger)
    # Stealth-aware title so /docs and /openapi.json don't reveal the real brand
    # before launch (neutral codename until JOBSEARCH_BRAND_MODE=public).
    brand = app_state.settings.public_brand

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        # In-process scheduler: fire due auto-apply grants / saved searches /
        # reminders on a cadence, so a single web process needs no external cron.
        import asyncio

        task = stop = None
        if app_state.settings.scheduler_enabled:
            from jobsearch.scheduler import run_periodically

            stop = asyncio.Event()
            task = asyncio.create_task(run_periodically(
                app_state, interval_seconds=app_state.settings.scheduler_interval_seconds, stop=stop,
            ))
        try:
            yield
        finally:
            if task is not None:
                stop.set()
                with contextlib.suppress(Exception):
                    await task

    app = FastAPI(
        title=f"{brand} API",
        version="0.1.0",
        description="HTTP layer over the core engines.",
        lifespan=lifespan,
    )
    app.state.jobsearch = app_state

    # Explicit arg wins (tests); otherwise take the configured, comma-separated
    # origins so production can allow its real frontend (e.g. the Readdy URL).
    origins = cors_origins or [
        o.strip() for o in app_state.settings.cors_origins.split(",") if o.strip()
    ] or ["http://localhost:3000"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in _ROUTERS:
        app.include_router(router)

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        s: AppState = app.state.jobsearch
        return {
            "status": "ok",
            "llm_provider": s.generation.llm.name,
            "review_model": s.settings.review_model,  # model for resume/cover-letter AI
            "embedding_provider": s.matching.embedder.name,
            "automation_mode": s.settings.automation_mode,
            "persistence": s.backend,
            # "ephemeral" => no persistent JOBSEARCH_ENCRYPTION_KEY is set, so
            # secrets at rest (connected sessions, OAuth tokens) won't survive a
            # restart. Must be "persistent" in production.
            "encryption": "ephemeral" if s.cipher.is_ephemeral else "persistent",
            # "in-process" => the API runs due grants/searches itself; "external"
            # => rely on the `python -m jobsearch.scheduler` cron.
            "scheduler": "in-process" if s.settings.scheduler_enabled else "external",
        }

    @app.get("/health/worker", tags=["meta"])
    def worker_health() -> dict:
        """Automation-worker liveness. The worker (a separate process) writes a
        heartbeat every scheduler tick; this reads it back from the shared DB.

        status: "never" (no tick recorded yet) | "ok" (last tick recent) |
        "stale" (last tick older than the threshold — the worker may be down)."""
        from datetime import timezone

        from jobsearch.models.common import utcnow

        s: AppState = app.state.jobsearch
        hb = None
        try:
            hb = s.worker_heartbeat.get("worker")
        except Exception:  # noqa: BLE001
            hb = None
        # Threshold: a few missed ticks. Uses this service's configured interval as
        # the reference (operators set web + worker similarly), with a floor.
        threshold = max(120, 3 * s.settings.scheduler_interval_seconds)
        if hb is None or hb.last_tick_at is None:
            return {"status": "never", "last_tick_at": None, "seconds_since": None,
                    "threshold_seconds": threshold, "ticks": 0, "last_summary": {}}
        last = hb.last_tick_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        seconds_since = max(0, int((utcnow() - last).total_seconds()))
        return {
            "status": "ok" if seconds_since <= threshold else "stale",
            "last_tick_at": hb.last_tick_at.isoformat(),
            "seconds_since": seconds_since,
            "threshold_seconds": threshold,
            "ticks": hb.ticks,
            "last_summary": hb.last_summary,
        }

    @app.get("/api/v1/branding", tags=["meta"])
    def branding() -> dict:
        """Public display identity for the frontend. Returns the codename while in
        stealth mode; the real brand only once JOBSEARCH_BRAND_MODE=public. Also
        tells the UI whether signups are open/invite/closed so it can show the gate."""
        s: AppState = app.state.jobsearch
        return {
            "name": s.settings.public_brand,
            "brand_mode": s.settings.brand_mode,
            "signup_mode": s.settings.signup_mode,
        }

    return app
