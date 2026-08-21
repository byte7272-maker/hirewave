# Operator Runbook

Bring the whole Job-Search Automation Platform up with Docker Compose: Postgres +
API + frontend. Then drop in real credentials to turn on live features.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- Ports free: `3000` (frontend), `8000` (API), `5432` (Postgres)

## 1. First boot (mock mode — no secrets needed)

```bash
cp .env.docker.example .env
# set POSTGRES_PASSWORD in .env
docker compose up --build
```

- Frontend → http://localhost:3000
- API docs → http://localhost:8000/docs
- Health → http://localhost:8000/health (shows `persistence: postgresql`)

Register a user in the UI and click through: load sample jobs → prepare
application → approve → submit. In mock/simulate mode this runs end-to-end with
no external calls, now persisting to Postgres.

## 2. Generate the production secrets

These must be **stable across restarts** — without them the encryption key and JWT
keypair are regenerated each boot, invalidating stored tokens and sessions.

```bash
# AES-256 field-encryption key (OAuth tokens at rest)
docker compose run --rm api python -m jobsearch.security.crypto keygen

# JWT RS256 signing keypair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_priv.pem
openssl rsa -in jwt_priv.pem -pubout -out jwt_pub.pem
```

Put the results in `.env`:
- `JOBSEARCH_ENCRYPTION_KEY=<keygen output>`
- `JOBSEARCH_JWT_PRIVATE_KEY` / `JOBSEARCH_JWT_PUBLIC_KEY` — paste the PEM as a
  single line with literal `\n` between lines, e.g.
  `JOBSEARCH_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

Then `docker compose up -d --force-recreate api`.

## 3. Turn on live features (each is independent)

Edit `.env`, then `docker compose up -d --force-recreate api` (and `frontend` if noted).

| Feature | Set |
|---|---|
| **Claude document generation** | `JOBSEARCH_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=sk-ant-...` |
| **Semantic matching** | `JOBSEARCH_EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY=sk-...` |
| **OAuth integrations** | `JOBSEARCH_OAUTH_MODE=live` + each provider's `*_CLIENT_ID/SECRET`. Register the OAuth apps in each provider console; set the redirect URI to `http://localhost:8000/api/v1/integrations/callback/<provider>` (Google shares `GOOGLE_CLIENT_ID/SECRET` for Gmail + Drive; request the `gmail.send` scope for email submission). |
| **Live email submission** | `JOBSEARCH_AUTOMATION_MODE=live` + a user who has connected Gmail |
| **LinkedIn/Indeed browser apply** | `JOBSEARCH_AUTOMATION_MODE=live`; the API image does **not** include Playwright by default — add `.[automation]` to the Dockerfile install and `playwright install chromium`, and supply a per-user authenticated `storage_state`. Until then these degrade to a manual fallback. |

Safety note: every live channel still requires the user to **approve** their
résumé and cover letter first; CAPTCHAs are escalated to the user (never solved),
and unknown application questions abort to a manual fallback (never fabricated).

## 4. Operations

```bash
docker compose ps                       # status
docker compose logs -f api              # tail API logs
docker compose logs -f frontend
docker compose exec db psql -U jobsearch jobsearch   # SQL shell
docker compose restart api              # restart after non-.env code changes
docker compose down                     # stop (keeps the pgdata volume)
docker compose down -v                  # stop AND delete the database volume
```

**Backups**

```bash
docker compose exec db pg_dump -U jobsearch jobsearch > backup.sql
# restore: docker compose exec -T db psql -U jobsearch jobsearch < backup.sql
```

## 5. Schema / migrations

The schema is created automatically on API startup (`create_all`). This is fine
for first boot and additive changes. For production schema **evolution**, add
Alembic (`pip install alembic`, `alembic init`, point `sqlalchemy.url` at
`JOBSEARCH_DATABASE_URL`) and run `alembic upgrade head` as a startup step instead
of relying on `create_all`.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `api` exits immediately | Check `docker compose logs api`; usually the DB isn't ready — compose gates on `db` health, but a bad `JOBSEARCH_DATABASE_URL` override bypasses it. |
| Login works, then 401 after a restart | JWT keys are ephemeral — set `JOBSEARCH_JWT_PRIVATE_KEY/PUBLIC_KEY` (step 2). |
| Connected integrations disappear after restart | Encryption key is ephemeral — set `JOBSEARCH_ENCRYPTION_KEY` (step 2). |
| Frontend can't reach the API | It proxies `/api/*` to `API_PROXY_TARGET` (default `http://api:8000`); confirm the `api` service is healthy. |
| `/health` shows `persistence: memory` | `JOBSEARCH_DATABASE_URL` isn't set — compose sets it; check you didn't override it empty in `.env`. |

## 7. Verify a healthy stack

```bash
curl -s localhost:8000/health           # {"status":"ok","persistence":"postgresql",...}
curl -s localhost:3000/health           # proxied to the API
```
