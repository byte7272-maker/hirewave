"""CORS origins come from settings (comma-separated) so prod can allow its
real frontend origin — not just localhost."""

from __future__ import annotations

from fastapi.middleware.cors import CORSMiddleware

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger


def _cors_origins(app) -> list[str]:
    for m in app.user_middleware:
        if m.cls is CORSMiddleware:
            return list(m.kwargs["allow_origins"])
    raise AssertionError("CORS middleware not installed")


def test_cors_defaults_to_localhost():
    app = create_app(state=AppState(exchanger=MockTokenExchanger()))
    assert _cors_origins(app) == ["http://localhost:3000"]


def test_cors_reads_configured_origins():
    state = AppState(
        exchanger=MockTokenExchanger(),
        settings=Settings(cors_origins="https://app.readdy.ai, https://hirewave.com"),
    )
    assert _cors_origins(create_app(state=state)) == [
        "https://app.readdy.ai",
        "https://hirewave.com",
    ]


def test_explicit_arg_still_wins():
    app = create_app(state=AppState(exchanger=MockTokenExchanger()), cors_origins=["https://x.dev"])
    assert _cors_origins(app) == ["https://x.dev"]
