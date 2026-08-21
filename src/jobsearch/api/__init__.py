"""HTTP/API layer — a FastAPI app mapping the plan's §5 endpoints onto engines.

The engines are transport-agnostic; this package is a thin adapter that handles
auth, request/response DTOs, and persistence wiring. Build the app with
:func:`jobsearch.api.app.create_app` and serve it with uvicorn::

    uvicorn jobsearch.api.app:create_app --factory --reload
"""

from jobsearch.api.app import create_app

__all__ = ["create_app"]
