# Deploying the backend to a single VPS (cheapest + fast)

The whole backend — FastAPI + Postgres + (optional) coturn TURN relay — runs on
**one small VPS** from the existing `docker compose` files, behind **Caddy** for
automatic HTTPS. Recommended box: **Hetzner CX22** (2 vCPU / 4 GB, ~€4/mo, US
regions available). This is the best performance-per-dollar because the API and
its database sit on the same host (localhost DB latency, no network hop) and
there are no cold starts.

The frontend is **not** hosted here — it lives on Readdy/Vercel and talks to this
API over HTTPS. That's why you set `JOBSEARCH_CORS_ORIGINS` to the frontend URL.

## 1. Point DNS

Create an **A record** (and AAAA if you have IPv6) for your API hostname, e.g.
`api.hirewave.com`, pointing at the VPS's public IP. Caddy needs this resolvable
to issue the certificate.

## 2. Get the code + secrets onto the box

```bash
# from your machine — copy the project up (or git clone on the box)
scp -r JobSearchPlatform root@YOUR_VPS_IP:/root/
ssh root@YOUR_VPS_IP
cd /root/JobSearchPlatform
cp .env.docker.example .env
```

Fill in `.env` (the REQUIRED ones):

| Var | What |
|---|---|
| `POSTGRES_PASSWORD` | strong DB password |
| `JOBSEARCH_ENCRYPTION_KEY` | `docker compose run --rm api python -m jobsearch.security.crypto keygen` |
| `JOBSEARCH_JWT_PRIVATE_KEY` / `JOBSEARCH_JWT_PUBLIC_KEY` | RS256 PEMs (see `.env.docker.example` for the openssl commands) |
| `JOBSEARCH_CORS_ORIGINS` | your frontend origin, e.g. `https://app.readdy.ai` |
| `API_DOMAIN` | the hostname from step 1, e.g. `api.hirewave.com` |
| `TURN_SECRET`, `JOBSEARCH_TURN_URLS` | only if using the TURN relay (e.g. `turn:api.hirewave.com:3478?transport=udp`) |

## 3. Run the provisioner

```bash
sudo bash deploy/provision.sh
```

It installs Docker, locks down the firewall (only SSH/HTTP/HTTPS + the TURN
ports), builds and starts the stack, and installs the nightly backup cron. It
auto-includes coturn only if `JOBSEARCH_TURN_URLS` is set.

## 4. Verify

```bash
docker compose ps                       # all healthy
curl https://api.hirewave.com/health    # {"status":"ok", "persistence":"postgresql", ...}
```

Then set the frontend's API base URL to `https://api.hirewave.com`.

## Operations

- **Logs:** `docker compose logs -f api`
- **Update:** `git pull` (or re-`scp`), then
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile turn up -d --build`
- **Backups:** nightly `pg_dump` to `/opt/jobsearch-backups` (14-day retention).
  Restore: `gunzip -c FILE.sql.gz | docker compose exec -T db psql -U jobsearch jobsearch`
- **Also enable Hetzner's automated snapshots (~+20%)** so a dead disk is
  recoverable — the single-VPS trade-off is that there's no automatic failover.

## When to graduate off one box

Move the DB to managed HA Postgres (or the API to Cloud Run) only when
*availability* — not speed — is worth ~10× the cost, i.e. when an hour of
downtime costs real users/revenue. Until then, one VPS is faster per dollar.
