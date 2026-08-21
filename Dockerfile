# --- Job-Search Platform API (FastAPI + engines + SQL persistence) ---------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install the package with the API, Postgres, and LLM extras. Copy only what the
# build needs first so the layer caches across source-only changes.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --upgrade pip setuptools wheel \
    && pip install ".[api,postgres,anthropic,openai,firebase]"

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# Schema is created on startup (create_all); compose gates start on db health.
# Honor $PORT when the host assigns one (Railway/Cloud Run); default 8000 for
# compose/VPS where Caddy proxies to api:8000. `exec` keeps uvicorn as PID 1.
CMD ["sh", "-c", "exec uvicorn jobsearch.api.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]

# redeploy trigger 4ff731e
