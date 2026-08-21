# Deploy the Hirewave backend on Railway (step by step)

Goal: get the FastAPI backend live at a public HTTPS URL (Railway gives you one
like `https://hirewave-api-production.up.railway.app`) so the Readdy site can
call it and Firebase login works. **No server to manage, no domain to buy.**

You only do the account creation + clicks; the code is ready (the Dockerfile
honors Railway's port, and the Firebase key is read from an env var).

---

## Step 0 — What you'll set (have these ready)

- Your **Firebase service-account JSON** (Firebase Console → Project settings →
  Service accounts → *Generate new private key*). You'll paste its **contents**
  into a variable — no file needed.
- A couple of generated secrets (commands below).

---

## Step 1 — Create the Railway project

1. Sign up at <https://railway.app> (GitHub login is easiest) and add a payment
   method (Railway needs one; the Hobby plan is ~$5/mo of usage).
2. **New Project**.
   - **If the code is on GitHub:** choose **Deploy from GitHub repo** → pick the
     repo. Railway auto-detects the `Dockerfile` and builds it.
   - **If it's not on GitHub:** install the CLI and push from your machine:
     ```bash
     npm i -g @railway/cli
     railway login
     cd "C:/Users/byte_/OneDrive/Documents/Claude Projects/JobSearchPlatform"
     railway init          # creates the project
     railway up            # builds & deploys the Dockerfile
     ```

## Step 2 — Add a Postgres database

1. In the project canvas → **New → Database → Add PostgreSQL**.
2. Railway provisions it and exposes variables (`PGHOST`, `PGUSER`,
   `PGPASSWORD`, `PGPORT`, `PGDATABASE`) you'll reference next.

## Step 3 — Set the variables on the API service

Click your **API service → Variables** tab → add these (Raw editor makes it fast):

```
# --- database (reference the Postgres service's canonical URL; the app
#     normalizes the postgres:// scheme to psycopg3 automatically) ---
JOBSEARCH_DATABASE_URL=${{Postgres.DATABASE_URL}}

# --- security (generate — see below) ---
JOBSEARCH_ENCRYPTION_KEY=<openssl rand -base64 32>
JOBSEARCH_JWT_PRIVATE_KEY=<one-line PEM with \n>
JOBSEARCH_JWT_PUBLIC_KEY=<one-line PEM with \n>

# --- Firebase sign-in (live) ---
JOBSEARCH_FIREBASE_AUTH=live
JOBSEARCH_FIREBASE_PROJECT_ID=hirewave-2de48
JOBSEARCH_FIREBASE_CREDENTIALS_JSON=<paste the entire service-account JSON here>

# --- who may call the API ---
JOBSEARCH_CORS_ORIGINS=https://hlrtlg.readdy.co
```

> `${{Postgres.*}}` are Railway variable references — if your Postgres service is
> named something other than "Postgres", match that name.

**Generate the secrets** locally (paste the outputs in):
```bash
# encryption key
openssl rand -base64 32

# JWT RS256 keypair → one line each with literal \n (backend un-escapes it)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_priv.pem
openssl rsa -in jwt_priv.pem -pubout -out jwt_pub.pem
awk 'BEGIN{ORS="\\n"} {print}' jwt_priv.pem   # → JOBSEARCH_JWT_PRIVATE_KEY
awk 'BEGIN{ORS="\\n"} {print}' jwt_pub.pem    # → JOBSEARCH_JWT_PUBLIC_KEY
```

For `JOBSEARCH_FIREBASE_CREDENTIALS_JSON`, open the downloaded service-account
file and paste its **whole contents** as the value (Railway handles the
multi-line JSON fine).

## Step 4 — Expose the service publicly

1. API service → **Settings → Networking → Generate Domain**.
2. Railway gives you `https://<something>.up.railway.app`. Copy it — that's your
   backend URL. (Railway sets `PORT`; the Dockerfile already binds to it.)

## Step 5 — Redeploy & verify

Any variable change triggers a redeploy; wait for it to go green, then:
```bash
curl https://<something>.up.railway.app/health
# → {"status":"ok","persistence":"postgresql",...}

# live Firebase verification is active (a fake token is rejected):
curl -X POST https://<something>.up.railway.app/api/v1/auth/firebase \
  -H "Content-Type: application/json" -d '{"id_token":"not-real"}'
# → 401 invalid Firebase token
```
Check **Deploy logs** in Railway if `/health` doesn't come up.

## Step 6 — Point the Readdy frontend at it

In **Readdy**, set the env var and republish:
```
VITE_PUBLIC_API_BASE_URL=https://<something>.up.railway.app
```
Now: user clicks **Continue with Firebase** → Google login → token →
`…up.railway.app/api/v1/auth/firebase` → signed in. Done.

---

## Costs

- Railway Hobby: **~$5/mo** of usage for a small always-on API + Postgres.
- Firebase login stays free.

## Updating later

- **GitHub deploy:** push to the branch → Railway rebuilds automatically.
- **CLI deploy:** `railway up` again from the project folder.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails | Check the build logs — usually a Dockerfile/deps issue. The image installs the `firebase` extra already. |
| `/health` shows `persistence: memory` | `JOBSEARCH_DATABASE_URL` isn't set/resolving — check the `${{Postgres.*}}` references and that the Postgres service name matches. |
| `/auth/firebase` 500 | Bad `JOBSEARCH_FIREBASE_CREDENTIALS_JSON` (must be the full valid JSON) or wrong `JOBSEARCH_FIREBASE_PROJECT_ID`. |
| CORS error in browser | `JOBSEARCH_CORS_ORIGINS` must be exactly `https://hlrtlg.readdy.co`. |
| App crashes on boot / port | Not an issue with this image — it honors Railway's `$PORT`. If you forked the Dockerfile, keep the `${PORT:-8000}` bind. |
