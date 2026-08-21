"""Run the API with uvicorn: ``python -m jobsearch.api``."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "jobsearch.api.app:create_app",
        factory=True,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("RELOAD")),
    )


if __name__ == "__main__":
    main()
