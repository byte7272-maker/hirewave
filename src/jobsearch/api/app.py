"""FastAPI application factory."""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jobsearch.api.routers import (
    applications,
    assistant,
    auth,
    authenticity,
    auto_apply,
    boards,
    community,
    documents,
    experience,
    inbox,
    integrations,
    interview,
    jobs,
    monitoring,
    notifications,
    onboarding,
    practice,
    screener,
    reminders,
    social,
    sourcing,
    users,
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
    notifications.router,
    onboarding.router,
    reminders.router,
]


def create_app(
    *,
    state: Optional[AppState] = None,
    exchanger: Optional[TokenExchanger] = None,
    cors_origins: Optional[list[str]] = None,
) -> FastAPI:
    """Build the API. Pass a custom ``state``/``exchanger`` for tests."""
    app = FastAPI(
        title="Job-Search Automation Platform API",
        version="0.1.0",
        description="HTTP layer over the five core engines (plan §5).",
    )
    app_state = state or AppState(exchanger=exchanger)
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
            "embedding_provider": s.matching.embedder.name,
            "automation_mode": s.settings.automation_mode,
            "persistence": s.backend,
        }

    return app
