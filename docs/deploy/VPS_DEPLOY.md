# Deploy the Hirewave backend on a VPS (step by step)

Goal: get the FastAPI backend running at a public **HTTPS** URL (e.g.
`https://api.hirewave.com`) so the Readdy site (`https://hlrtlg.readdy.co`) can
call it and Firebase login works end to end.

You'll do this once. It uses the deploy kit already in the repo
(`docker-compose.prod.yml`, `deploy/provision.sh`, Caddy for automatic HTTPS).

---

## Prerequisite: a domain for the API

The Readdy site is HTTPS, so the backend **must** be HTTPS too (browsers block a
secure page from calling an insecure API). HTTPS needs a certificate, and
certificates need a **domain name** — Let's Encrypt won't issue one for a bare IP.

Pick one:

- **You own a domain** (e.g. `hirewave.com`): you'll add a subdomain record
  `api.hirewave.com` → your server IP. ✅ best.
- **You don't own one:** either buy a cheap domain (~$10/yr at Namecheap/Cloudflare)
  **or** use a **free** subdomain from <https://www.duckdns.org> — sign in, create
  a name like `hirewave`, and you get `hirewave.duckdns.org` you point at your IP.
  Caddy issues a valid cert for it just the same.

Whatever you choose, that hostname (call it **`API_DOMAIN`**) is what the frontend
will call. Below I use `api.hirewave.com` — substitute yours.

---

## Step 1 — Create the server (Hetzner)

1. Sign up at <https://www.hetzner.com/cloud> → open **Hetzner Cloud Console**.
2. **New Project** → name it `hirewave`.
3. **Add Server**:
   - **Location:** a US region (e.g. Ashburn or Hillsboro) if your users are US.
   - **Image:** **Ubuntu 24.04**.
   - **Type:** **CX22** (2 vCPU / 4 GB, ~€4/mo) — plenty for this.
   - **SSH key:** add your public key if you have one (recommended). No key? It'll
     email you a root password.
   - **Name:** `hirewave-api`. Click **Create & Buy now**.
4. Copy the server's **public IPv4** (e.g. `203.0.113.10`).

## Step 2 — Point your domain at the server

In your DNS provider (or DuckDNS):
- Add an **A record**: `api.hirewave.com` → `203.0.113.10` (your server IP).
- (DuckDNS: just set the IP for your subdomain.)

Give DNS a few minutes. Check it resolves:
```bash
ping api.hirewave.com   # should show the server IP
```

## Step 3 — Get the project onto the server

From your Windows machine (Git Bash / PowerShell), copy the project up. Replace
the IP with yours:
```bash
scp -r "C:/Users/byte_/OneDrive/Documents/Claude Projects/JobSearchPlatform" root@203.0.113.10:/root/
```
Then log in:
```bash
ssh root@203.0.113.10
cd /root/JobSearchPlatform
```

## Step 4 — Put the Firebase service-account key on the server

Copy the JSON you downloaded from Firebase (Project settings → Service accounts)
into the secrets folder the container mounts:
```bash
mkdir -p /root/JobSearchPlatform/deploy/secrets
# from your machine, in a second terminal:
scp "C:/path/to/firebase-sa.json" root@203.0.113.10:/root/JobSearchPlatform/deploy/secrets/firebase-sa.json
```
It'll be visible to the API container at `/run/secrets/firebase-sa.json`.

## Step 5 — Create the `.env`

On the server:
```bash
cp .env.docker.example .env
nano .env      # (or vim)
```
Fill in these (the rest can stay default):
```
# database
POSTGRES_PASSWORD=<pick a strong password>

# security — generate these (commands below)
JOBSEARCH_ENCRYPTION_KEY=<from keygen>
JOBSEARCH_JWT_PRIVATE_KEY=<PEM, one line with \n>
JOBSEARCH_JWT_PUBLIC_KEY=<PEM, one line with \n>

# Firebase sign-in (live)
JOBSEARCH_FIREBASE_AUTH=live
JOBSEARCH_FIREBASE_PROJECT_ID=hirewave-2de48
JOBSEARCH_FIREBASE_CREDENTIALS_FILE=/run/secrets/firebase-sa.json

# who may call the API + HTTPS domain
JOBSEARCH_CORS_ORIGINS=https://hlrtlg.readdy.co
API_DOMAIN=api.hirewave.com
```

**Generate the secrets** (run on the server, paste the outputs into `.env`):
```bash
# encryption key — a base64-encoded 32-byte key
openssl rand -base64 32

# JWT RS256 keypair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_priv.pem
openssl rsa -in jwt_priv.pem -pubout -out jwt_pub.pem
# collapse each PEM to a single line with literal \n (the backend un-escapes it):
awk 'BEGIN{ORS="\\n"} {print}' jwt_priv.pem   # → JOBSEARCH_JWT_PRIVATE_KEY
awk 'BEGIN{ORS="\\n"} {print}' jwt_pub.pem    # → JOBSEARCH_JWT_PUBLIC_KEY
```

## Step 6 — Run the provisioner

```bash
sudo bash deploy/provision.sh
```
It installs Docker, locks the firewall to SSH/HTTP/HTTPS, builds and starts
**API + Postgres + Caddy**, and sets up the nightly backup + scheduler crons.
Caddy automatically gets a Let's Encrypt certificate for `API_DOMAIN` (this is
why DNS must resolve first).

## Step 7 — Verify

```bash
docker compose ps                      # all services "healthy"
curl https://api.hirewave.com/health   # {"status":"ok","persistence":"postgresql",...}
```
Then test the Firebase exchange against the live backend:
```bash
# In live mode a plain email is rejected (good — it wants a real token):
curl -X POST https://api.hirewave.com/api/v1/auth/firebase \
  -H "Content-Type: application/json" -d '{"id_token":"not-a-real-token"}'
# → 401 invalid Firebase token   (means verification is active)
```

## Step 8 — Point the frontend at it

In **Readdy**, set the env var:
```
VITE_PUBLIC_API_BASE_URL=https://api.hirewave.com
```
Republish the Readdy site. Now: user clicks **Continue with Firebase** → Google
login → token → `https://api.hirewave.com/api/v1/auth/firebase` → signed in.

---

## Updating later

```bash
cd /root/JobSearchPlatform
# copy new code up (scp) or git pull, then:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Costs

- Hetzner CX22: **~€4/mo**. Add automated backups (**+~€1/mo**) in the Hetzner
  console — recommended, since a single VPS has no automatic failover.
- Firebase login stays free (Spark/Blaze free tier).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Caddy can't get a cert | DNS for `API_DOMAIN` isn't pointing at the server yet, or ports 80/443 blocked. Confirm `ping api.hirewave.com` shows the IP; re-run after DNS settles. |
| `/auth/firebase` returns 500 | `firebase-admin` missing or bad service-account path. Confirm the file is at `/run/secrets/firebase-sa.json` and `JOBSEARCH_FIREBASE_PROJECT_ID=hirewave-2de48`. |
| Browser CORS error | `JOBSEARCH_CORS_ORIGINS` must be exactly `https://hlrtlg.readdy.co`; redeploy after changing. |
| Mixed-content blocked | The API must be `https://` — that's the whole reason for the domain + Caddy. |
