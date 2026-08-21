# Job-Search Automation Platform — Core Engines

Python engine layer for the Job-Search Automation Platform described in the
[high-level plan](#mapping-to-the-plan). These are the five **framework-free
core engines** that a web/API layer (FastAPI/Next.js) will later call. Every
engine runs fully offline out of the box (deterministic mock LLM + embeddings,
simulated automation), so the whole pipeline is testable with **no API keys**.

```
Integration → Verification → Matching → Generation → Automation
  (OAuth)      (anti-fraud)   (ranking)   (résumé)    (submit)
```

## The five engines

| # | Engine | Module | What it does |
|---|--------|--------|--------------|
| 1 | **Integration** | `jobsearch.engines.integration` | OAuth 2.0 (PKCE) connect flow for LinkedIn, Gmail, Google Drive, Indeed, Greenhouse, Workday; AES-256-GCM encrypted token store; auto-refresh; revoke. |
| 2 | **Generation** | `jobsearch.engines.generation` | Tailored, ATS-optimized résumés & cover letters via a pluggable LLM. Keyword extraction/injection, ATS scoring, versioning, **mandatory human approval gate**. |
| 3 | **Matching** | `jobsearch.engines.matching` | Semantic (embedding cosine) + weighted scoring (skills/location/salary/seniority) → composite `match_score` 0–100, gap analysis, per-user feedback learning. |
| 4 | **Verification** | `jobsearch.engines.verification` | Fraud/authenticity scoring (urgency language, unrealistic promises, off-platform contact, salary plausibility, domain age, posting velocity, scam DB) → 0–100 + display policy. |
| 5 | **Automation** | `jobsearch.engines.automation` | Platform adapters (LinkedIn/Indeed/Greenhouse/Workday/email) to submit **only after approval**. Rate limiting, audit trail, CAPTCHA escalation, manual fallback. |

Shared foundation: `jobsearch.models` (domain data model), `jobsearch.llm`
(provider-agnostic LLM/embeddings), `jobsearch.security` (field encryption),
`jobsearch.store` (in-memory reference repositories), `jobsearch.platform`
(a facade that wires all five together).

## Run the whole stack (Docker)

The fastest way to run everything — Postgres + API + frontend — is Docker Compose:

```bash
cp .env.docker.example .env      # set POSTGRES_PASSWORD; other secrets optional for mock mode
docker compose up --build
```

- Frontend → http://localhost:3000
- API + docs → http://localhost:8000/docs
- Health → http://localhost:8000/health (`persistence: postgresql`)

It boots in mock/simulate mode with no external keys. See
[docs/RUNBOOK.md](docs/RUNBOOK.md) for generating the production secrets
(encryption + JWT keys) and turning on live Claude / embeddings / OAuth / email.

**Optional TURN relay** (peer video calls behind restrictive NATs) — a coturn
service ([`deploy/coturn/turnserver.conf`](deploy/coturn/turnserver.conf)) ships
in the compose file behind a `turn` **profile**, so the default `up` skips it.
To run it, put a shared secret + relay URL in `.env` and start with the profile:

```bash
echo "TURN_SECRET=$(openssl rand -hex 32)" >> .env
echo "JOBSEARCH_TURN_URLS=turn:YOUR_HOST:3478?transport=udp" >> .env
docker compose --profile turn up --build
```

The API and coturn share the one `TURN_SECRET`; the API mints short-lived
per-user credentials from it (the secret never reaches the browser) and coturn
validates them with the same secret. `network_mode: host` (Linux) is the default;
the file notes the Docker-Desktop port-publish alternative and the `turns:` TLS
setup. With nothing set, peer calls just use public STUN.

## Quick start (engine dev, no Docker)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   *nix: source .venv/bin/activate
pip install pydantic pydantic-settings httpx numpy cryptography pytest pytest-asyncio

# run everything offline
PYTHONPATH=src python examples/demo.py
PYTHONPATH=src pytest -q
```

> Behind a TLS-intercepting proxy, add
> `--trusted-host pypi.org --trusted-host files.pythonhosted.org` to `pip`.
> Once `setuptools` is available you can `pip install -e ".[dev]"` and drop the
> `PYTHONPATH=src` prefix.

Minimal usage:

```python
from jobsearch.platform import JobSearchPlatform

p = JobSearchPlatform()

verdict = p.verification.verify(job)          # -> VerificationResult (0-100)
ranked  = p.matching.rank(profile, jobs)      # -> [MatchResult] sorted by score
resume  = p.generation.generate_resume(profile, ranked[0].job)
cover   = p.generation.generate_cover_letter(profile, ranked[0].job, resume=resume)

p.generation.approve(resume); p.generation.approve(cover)   # human-in-the-loop gate
result  = p.automation.submit(ApplicationContext(...))       # only runs if approved
```

## Configuration

Copy `.env.example` → `.env`. All settings default to safe offline values.

| Variable | Purpose | Default |
|----------|---------|---------|
| `JOBSEARCH_LLM_PROVIDER` | `anthropic` / `openai` / `mock` | `mock` |
| `JOBSEARCH_EMBEDDING_PROVIDER` | `openai` / `mock` | `mock` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | real generation/embeddings | — |
| `JOBSEARCH_ENCRYPTION_KEY` | 32-byte key (base64/hex) for token encryption | ephemeral |
| `JOBSEARCH_AUTOMATION_MODE` | `simulate` / `live` | `simulate` |
| `<PROVIDER>_CLIENT_ID/SECRET` | OAuth app credentials for live flows | — |

Generate an encryption key:

```bash
PYTHONPATH=src python -m jobsearch.security.crypto keygen
```

### Real Claude-powered generation

The résumé/cover-letter engine can generate with real Claude instead of the mock:

```bash
pip install "anthropic>=0.40"
export JOBSEARCH_LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...          # or run `ant auth login` (ambient creds work too)
# optional: export ANTHROPIC_MODEL=claude-opus-4-8   (the default)

PYTHONPATH=src python examples/anthropic_smoke.py    # prints a real resume + cover letter
```

The provider ([`jobsearch/llm/providers.py`](src/jobsearch/llm/providers.py)) targets
`claude-opus-4-8` and deliberately **omits `temperature`/`top_p`/`top_k`** — those are
rejected with a 400 on Opus 4.8/4.7; output is steered via the prompt instead. It resolves
ambient credentials (env var or `ant` profile) when no key is configured, filters response
content to text blocks, and surfaces API errors as clear exceptions. The whole platform still
runs offline with the mock provider when `JOBSEARCH_LLM_PROVIDER` is unset.

### Real semantic embeddings (job matching)

Anthropic has no embeddings API, so the matching engine uses OpenAI for true
semantic similarity (falling back to deterministic mock embeddings offline):

```bash
pip install "openai>=1.40"
export JOBSEARCH_EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY=sk-...            # OPENAI_EMBEDDING_MODEL defaults to text-embedding-3-small
```

Two efficiency measures make this API-friendly: `MatchingEngine.rank()` embeds the
profile and **all jobs in a single batched request** (one call, not N), and real
providers are wrapped in [`CachingEmbeddingProvider`](src/jobsearch/llm/cache.py)
— an LRU cache keyed by text — so re-ranks (e.g. after a save/apply/dismiss
feedback signal) and shared postings never re-embed. The OpenAI provider chunks
large batches, guards empty strings, and returns L2-normalized vectors in order.

## Design principles

- **Provider-agnostic** — engines depend on the `LLMProvider` /
  `EmbeddingProvider` ports, never a vendor SDK. Swap Claude ⇄ OpenAI ⇄ mock via config.
- **Ports & adapters** — the OAuth token endpoint (`TokenExchanger`), persistence
  (repositories), and submission targets (`ApplicationAdapter`) are all injected,
  so the same engines run under tests, a CLI, or a web server unchanged.
- **Offline-first** — deterministic mocks mean CI needs no secrets and no network.
- **Safety by construction** — submission physically cannot proceed without
  `resume.approved` (and cover letter, if present); rate limiting and audit
  trails are enforced in the engine, not left to callers.

## Web API layer

A FastAPI app (`jobsearch.api`) exposes the plan's §5 REST endpoints over the
engines, with JWT (RS256) auth. Run it:

```bash
pip install "fastapi>=0.110" "uvicorn[standard]>=0.29" "pyjwt>=2.8"
PYTHONPATH=src python -m jobsearch.api          # http://127.0.0.1:8000
# interactive docs at /docs  (OpenAPI at /openapi.json)
```

Endpoint groups (all under `/api/v1`, bearer-auth except register/login):

| Group | Endpoints | Engine |
|-------|-----------|--------|
| **auth** | `register`, `login`, `refresh`, `logout` | JWT RS256 + PBKDF2 |
| **users** | `users/me`, `users/me/profile`, `users/me/preferences` | — |
| **integrations** | `connect/{provider}`, `callback/{provider}`, list, revoke | Integration |
| **jobs** | list/search, `{id}`, `matches`, `ingest`, `{id}/verification` | Matching + Verification |
| **documents** | `resumes/generate`, **`resumes/upload`**, `resumes/{id}/file`, CRUD, `cover-letters/generate` | Generation + storage |
| **applications** | create, list, `{id}`, `{id}/submit`, `{id}/status` | Automation |
| **notifications** | list, `{id}/read`, `read-all` | — |

Auth uses short-lived access tokens + refresh tokens; the résumé/cover-letter
approval gate is enforced server-side (`PUT .../submit` returns **403** until the
documents are approved). Example flow:

```bash
curl -sX POST localhost:8000/api/v1/auth/register -d '{"email":"a@b.com","password":"supersecret"}' -H 'content-type: application/json'
TOK=$(curl -sX POST localhost:8000/api/v1/auth/login -d '{"email":"a@b.com","password":"supersecret"}' -H 'content-type: application/json' | jq -r .access_token)
curl -s localhost:8000/api/v1/jobs/matches -H "Authorization: Bearer $TOK"
```

The app is built by `create_app()` and keeps state (in-memory repos + engines) on
`app.state`. Making it production-grade is mainly swapping the in-memory
repositories in `jobsearch/api/state.py` for DB-backed ones with the same methods
— no handler changes — and providing real RSA JWT keys + OAuth client secrets.

## Frontend (Hirewave web app)

The primary web client lives in [`webapp/`](webapp) — the **Hirewave** UI
(Vite + React 19 + React Router 7 + TypeScript + Tailwind), wired to this API.
It proxies `/api/*` to the backend (no CORS) and covers the whole journey:
auth → dashboard → AI-ranked job matches (with authenticity badges, scam
filtering) → résumé/cover-letter generation → **approval gate** → submission →
live notifications, plus **Interview prep** (mock interviewer + question bank),
**Integrations** (OAuth connect/disconnect), **Settings** (profile, preferences,
résumé upload), and **Security** (breach monitoring + k-anonymity password check).

```bash
# terminal 1 — backend
PYTHONPATH=src python -m jobsearch.api            # http://localhost:8000
# terminal 2 — frontend
cd webapp && npm install && npm run dev           # http://localhost:3000
```

Real server state drives every view (no mock data): tokens live in
`localStorage` (`hw_access`/`hw_refresh`, auto-refreshed on 401); summary
widgets re-fetch on a shared `hw-data-changed` event after ingest/apply/submit.
Set `API_PROXY_TARGET` to point the dev proxy at a non-default backend. The
public marketing site surfaces the same capabilities — including the **Security**
section (`#security`) alongside **Interview prep** (`#interview`).

```bash
cd webapp && npm run type-check && npm run build   # gate: types + prod bundle
cd webapp && npm test                              # Vitest (Settings save round-trip)
```

> The earlier [`frontend/`](frontend) Next.js client is retained as a reference
> implementation; `webapp/` is the maintained UI.

### Video mock interview

The mock interviewer runs as a **video-call stage** ([`InterviewStage.tsx`](webapp/src/pages/dashboard/components/InterviewStage.tsx)):
an on-screen interviewer that **speaks each question in a natural voice**, **lip-syncs, blinks and
breathes** ([`InterviewerAvatar.tsx`](webapp/src/pages/dashboard/components/InterviewerAvatar.tsx)),
plus call controls (mic dictation, webcam self-view, mute, replay, captions) and live per-answer scoring.

- **Natural voices** — [`speech.ts`](webapp/src/lib/speech.ts) enumerates the platform's speech
  voices and ranks the most human ones first (Windows/Edge/Azure **Natural/Neural**, Chrome's
  Google voices), picking one that matches the interviewer's `gender` + `voice` tone. The backend
  persona now carries those presentation hints so the face and voice are consistent. A voice picker
  lets the user override (persisted). Spoken answers use the Web Speech recognition API; everything
  degrades to captions + typing when a browser lacks the APIs.
- **Photoreal upgrade path** — the persona exposes an optional `video_url`. When a neural-video
  provider (D-ID / HeyGen) supplies a talking-head clip, `InterviewerAvatar` plays that `<video>`
  instead of the animated SVG; pair it with a neural-TTS provider (ElevenLabs / OpenAI / Azure) for
  cloned human voices. These are external, key-gated services — the animated avatar + best-available
  device voice is the zero-dependency default.

### Upgrading the interview from your own sources

Voices, interviewers, and questions are **pluggable sources you point at your own
service or files** — nothing here is required, and everything falls back to the
offline default. The frontend calls `GET /interview/media/capabilities` and adapts
(server neural voice + real amplitude lip-sync when configured, otherwise the
browser voice; a persona picker appears when a library is present).

| Upgrade | How to point at your source | Contract |
| --- | --- | --- |
| **Neural voice** | `JOBSEARCH_TTS_PROVIDER=http` · `JOBSEARCH_TTS_URL=…` · `JOBSEARCH_TTS_API_KEY=…` | `POST {text, voice}` → **audio bytes** |
| **Talking-head video** | `JOBSEARCH_AVATAR_PROVIDER=http` · `JOBSEARCH_AVATAR_URL=…` · `JOBSEARCH_AVATAR_API_KEY=…` | `POST {persona, text}` → `{"video_url": …}` |
| **Interviewer personas** | `JOBSEARCH_PERSONA_LIBRARY=/path/personas.json` | JSON list — see [`examples/interview/personas.json`](examples/interview/personas.json) |
| **Interview questions** | `JOBSEARCH_QUESTION_BANK=/path/questions.json` | style-keyed JSON — see [`examples/interview/questions.json`](examples/interview/questions.json) |

The `http` media contract is deliberately vendor-neutral: front ElevenLabs / OpenAI /
Azure (voice) or D-ID / HeyGen (video) with a thin proxy, or self-host. Ports live in
[`engines/interview/media.py`](src/jobsearch/engines/interview/media.py); the
user-directed content loaders in
[`persona_library.py`](src/jobsearch/engines/interview/persona_library.py) and
[`question_bank.py`](src/jobsearch/engines/interview/question_bank.py). Each persona
maps to a `voice_id` (for your TTS source) and an optional `video_url`, so a library
interviewer carries its own face and voice. Try it locally:

```bash
JOBSEARCH_PERSONA_LIBRARY=examples/interview/personas.json \
JOBSEARCH_QUESTION_BANK=examples/interview/questions.json \
PYTHONPATH=src python -m jobsearch.api
```

### Peer practice interviews (video)

Instead of the AI persona, two connected users can run a **live video practice interview**
([`PeerCall.tsx`](webapp/src/pages/dashboard/components/PeerCall.tsx), the **With a peer**
tab). It's **WebRTC** with **REST-based signalling** — no new infra: each peer posts its SDP
offer/answer and ICE candidates to a per-session mailbox
([`engines/practice.py`](src/jobsearch/engines/practice.py)) and the other polls + consumes
them (`POST·GET /practice/{id}/signal[s]`). Practice is gated to your **connections**; both
see the same persona-free question list and can advance it, with an interviewer/candidate
role you can **swap** mid-session (synced over the same channel). Endpoints: `POST /practice`
(invite), `GET /practice`, `POST /practice/{id}/accept`·`/end`, `GET /practice/{id}/questions`.

**ICE / TURN relay.** `GET /webrtc/ice-servers` ([`webrtc.py`](src/jobsearch/webrtc.py))
hands the client its ICE config; `PeerCall` fetches it before opening the peer connection
(falling back to public STUN if unreachable). Public STUN (Google/Twilio) is always included
— enough for most networks. Behind restrictive/**symmetric NATs** a TURN relay is needed, so
set `JOBSEARCH_TURN_URLS` (comma-separated, e.g.
`turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349`). For credentials,
prefer coturn's **REST auth**: set `JOBSEARCH_TURN_SECRET` (the shared secret from coturn's
`static-auth-secret`) and each request mints a **short-lived, per-user credential** —
`username = "<expiry>:<user>"`, `credential = base64(HMAC-SHA1(secret, username))`, expiring
after `turn_ttl_seconds` (default 1h, floored to 60s). The static secret **never leaves the
backend**, and any leaked credential expires on its own — consistent with the platform's
"we never hand out standing credentials" stance. A static `JOBSEARCH_TURN_USERNAME` /
`JOBSEARCH_TURN_PASSWORD` pair is supported as a simpler fallback (the secret wins if both
are set). With nothing configured the endpoint returns STUN-only, so peer calls keep working
on unrestricted networks with zero setup.

### Crowdsourced questions

Beyond the file-based bank, users contribute questions for specific **job titles**
and everyone searches by job type — a living, community-sourced question bank
([`CommunityQuestionEngine`](src/jobsearch/engines/interview/community.py), the
**Community Q&A** tab in the interview page). Search is a transparent keyword-relevance
ranker (exact-title match → token overlap → helpful votes → recency; no embeddings
needed), questions upvote one-per-user, and flagged questions auto-hide past a
threshold. Picking results and hitting **Practise these** launches a video mock
interview seeded with them.

| Action | Endpoint |
| --- | --- |
| Search by job type | `GET /questions/search?job_title=…&category=…` |
| Popular titles | `GET /questions/titles` |
| Submit a question | `POST /questions {job_title, question, category, tips}` |
| Upvote (toggle) | `POST /questions/{id}/vote` |
| Flag | `POST /questions/{id}/flag` |
| My submissions | `GET /questions/mine` |

Responses hide voter/flagger identities and expose only vote counts plus the caller's
own `mine`/`voted` state. `POST /interview/mock/start` accepts an explicit
`questions` list, which is how the interview is seeded from search results.

## Multi-site job sourcing (the agent)

The service acts as the user's agent, ingesting postings from job boards
(Indeed, Monster, Glassdoor, …) and feeding them through the existing
**normalize → dedupe → verify → ingest → rank** pipeline
([`engines/sourcing/`](src/jobsearch/engines/sourcing)). A **Search across job
sites** panel on the Matches page runs it on demand; **saved searches** re-run on
a schedule and notify the user of new high-fit roles.

- **Fan-out** — one search hits every enabled `JobSource` in parallel; each adapter
  normalizes its board's payload into a `JobPosting` (tagged with `source_platform`).
- **Dedupe** — the same role across boards is collapsed (by role+company+location),
  and repeat searches skip anything already stored (by external id or normalized role).
- **Verify** — the existing fraud filter auto-hides scam postings before they reach matches.
- **Scheduled** — a `SavedSearch` (`role`, `location`, `remote`, `interval_minutes`)
  re-runs via `POST /job-search/run-due` (the hook a scheduler/cron calls) and raises a
  `match_found` notification naming the top new role.

| Action | Endpoint |
| --- | --- |
| Search now | `POST /job-search/run { role, location?, remote?, sources? }` |
| Save a search | `POST /job-search/searches` |
| List / pause / delete | `GET`·`PUT`·`DELETE /job-search/searches[/{id}]` |
| Run one now | `POST /job-search/searches/{id}/run` |
| Run all due (cron hook) | `POST /job-search/run-due` |
| Import a job-alert email | `POST /job-search/import-email` (multipart `.eml`) |

**From job-alert emails** — the user forwards/uploads their own LinkedIn/Indeed/Glassdoor
alert (`.eml`) and [`email_import.py`](src/jobsearch/engines/sourcing/email_import.py)
(stdlib `email` + `html.parser`, no deps) detects the board from the sender and extracts
the listed roles (filtering unsubscribe/CTA links), which flow through the same
dedupe → verify → ingest pipeline. Consent-based — it's the user's own inbox. The
**OAuth-Gmail read** path (auto-pull alerts from a connected inbox) is the documented
follow-on; the scope is already in the provider registry.

**The honest constraint** (same as LinkedIn): Indeed/Monster/Glassdoor gate their
APIs, so real ingestion uses official/partner APIs, licensed aggregator feeds, or the
user's connected account — within each board's ToS. The layer ships **mock-first**
(`job_source_provider=mock`, deterministic offline postings) with a generic
`http` aggregator adapter (`job_source_provider=http` + `job_source_url` + key) that
you point at a licensed job-search aggregator; more adapters slot in per source.

## Job authenticity — real vs fake, as community feedback

A shared ledger of whether a posting is **real, dubious, or a scam**, visible to all
users ([`engines/authenticity/`](src/jobsearch/engines/authenticity), the **Scam watch**
page + a verdict badge on every match). One record per normalized job identity
(company + title) fuses three signals into a single `verdict`:

1. **Community reports** — any user marks a posting legit / dubious / scam (one vote each,
   with an optional reason); the aggregate is shared, voter identities are never exposed.
2. **The fraud filter** — the existing `VerificationEngine` authenticity score (0–100).
3. **Employer-site check** — `POST /authenticity/job/{id}/verify-employer` confirms the
   posting is really available at the source (URL resolves, not expired, no link-shortener
   cloaking, verifiable domain). Best-effort — a signal, not proof — `mock` offline by
   default, `http` (`employer_verifier=http`) to actually fetch the page.

Verdicts range `verified_real` (employer-listed + community trust) → `likely_real` →
`unverified` → `dubious` → `likely_scam`. Endpoints: `GET /authenticity/job/{id}`,
`POST /authenticity/job/{id}/report`, `POST /authenticity/job/{id}/verify-employer`,
`GET /authenticity/flagged` (the shared scam-watch list).

> **On capturing LinkedIn logins:** the app deliberately does **not** ask users to log into
> LinkedIn through it or scrape their logged-in session — that means handling credentials and
> breaching ToS. Authorized access uses **OAuth** (the user consents on LinkedIn's own screen);
> job-alert **emails** can feed the system when the user forwards/uploads them or connects their
> inbox via OAuth. Both are consent-based and never touch the user's password.

## Import your profile from LinkedIn

Populate your profile (headline, summary, skills, experience, education) from LinkedIn,
shown as a **reviewable draft** with **per-field checkboxes** — tick exactly which skills,
roles and schools to keep, and what you see is what's saved. Applying **merges
non-destructively**, keeping your existing job preferences
([`linkedin_profile.py`](src/jobsearch/engines/integration/linkedin_profile.py),
the **Import from LinkedIn** card on Settings; the LinkedIn card on **Integrations** has an
*Import profile* action that jumps here and auto-runs the import). Three tiers, tried by
what's available:

- **Connected account** (`linkedin_profile_provider=http`) — fetches the OpenID Connect
  `userinfo` claims (or a partner-API proxy you point `linkedin_profile_url` at) using the
  encrypted OAuth token stored when you connected LinkedIn.
- **Data export** (`POST /integrations/linkedin/import-file`) — upload your own "Download
  your data" archive or exported résumé; it's text-extracted and parsed into a draft. This
  is the tier that yields *rich* data, since LinkedIn only returns full profiles to partner
  apps but lets **you** export your own.
- **`mock`** (default) — a deterministic demo profile so the whole flow runs offline.

| Action | Endpoint |
| --- | --- |
| Import from connected account | `POST /integrations/linkedin/import {apply}` |
| Import from an export file | `POST /integrations/linkedin/import-file` (multipart) |
| Apply a reviewed subset | `POST /integrations/linkedin/apply` (the kept fields) |

Import returns `{source, applied, profile}` (`apply:false` previews). The review UI then
posts only the ticked fields to `…/apply`, which merges them in — omitted/empty fields
leave the stored value untouched.

## Export your recommendations

Download the ranked job matches as **CSV** (spreadsheet), **JSON**, or a print-ready
**PDF shortlist** — an *Export* button on the **Job matches** page (all matches) and the
**Saved** page (just your saved jobs).

The PDF shortlist ([`pdfShortlist.ts`](webapp/src/lib/pdfShortlist.ts)) builds a self-contained,
typeset HTML sheet (one card per role: rank, fit badge, salary, matching/gap skills, apply
link) in its own window and triggers the browser's native *Save as PDF* — zero dependencies,
and untrusted fields are HTML-escaped. CSV/JSON come from the same endpoint:

- `GET /jobs/matches/export?format=csv|json` — ranks like `/jobs/matches` and streams an
  `attachment` (`job-recommendations.csv`/`.json`). Columns: rank, title, company, location,
  remote, salary min/max, currency, fit score, authenticity score, matching & gap skills, url.
- `?ids=<comma-separated job ids>` exports just those (the Saved page passes your saved ids).

The browser download is an authenticated fetch → blob (the bearer token can't ride on a
plain `<a download>`), so exports respect the same auth as the rest of the API.

## Inbox — forward job alerts to your account

Every user gets a personal forwarding address `jobs+<token>@<inbox_domain>`
([`engines/inbox.py`](src/jobsearch/engines/inbox.py), the **Inbox** page). An
inbound-email provider (SendGrid Inbound Parse / Postmark / Mailgun routes) POSTs
received mail to `POST /inbox/inbound`, which routes by the address token → files the
email in that user's inbox → runs its job links through the sourcing ingest pipeline.
Consent-based: only alerts the user forwards here are read. The webhook is gated by a
shared secret (`JOBSEARCH_INBOX_WEBHOOK_SECRET`); the `.eml` upload on the Matches page
feeds the same path. A **Sync Gmail** button (`POST /inbox/sync-gmail`) auto-pulls recent
alerts from a connected Gmail inbox — mock samples offline (`gmail_fetch=mock`), the real
Gmail API with the read scope when `gmail_fetch=http`.

## Messages — connect and share roles

Users connect and message each other, and **share job postings**
([`engines/social.py`](src/jobsearch/engines/social.py), the **Messages** page + a
Share button on every match). Since there's no outbound-email service, invites are
**share codes/links**: `POST /social/invites` mints a code, the other person redeems it
(`POST /social/invites/accept`), and only then can they DM (`POST /social/messages`,
optionally with a `shared_job_id`). New messages raise a notification.

| Action | Endpoint |
| --- | --- |
| Invite / accept | `POST /social/invites` · `POST /social/invites/accept` |
| Connections / threads | `GET /social/connections` · `GET /social/threads` |
| Conversation / send | `GET /social/messages/{userId}` · `POST /social/messages` |
| Invite by email | `POST /social/invites/email` |

Invites work as **share codes** by default; `POST /social/invites/email` also *sends* the
invite when an outbound-email provider is configured (`email_sender=http` + `email_sender_url`),
and returns the code/link regardless so it works offline (`email_sender=mock`).

## Boards — group channels

Shared message boards ([`engines/boards.py`](src/jobsearch/engines/boards.py), the **Boards**
page): create a **public** (discoverable) or **private** (join-by-code) board, and members
post and **share job postings** in a feed. `GET /boards` (yours), `GET /boards/discover`,
`POST /boards`, `POST /boards/join`, `GET·POST /boards/{id}/posts`, `GET /boards/{id}/members`.
Posting requires membership; private boards require the join code.

## Automation assistant (permission-first, never your passwords)

The app acts on the user's behalf **only for the automations they switch on**, and
**never handles credentials** — users authenticate directly with providers via OAuth
([`engines/assistant/`](src/jobsearch/engines/assistant), the **Assistant** page + a
per-job auto-fill preview). Three consent scopes, all **off by default**: `form_autofill`,
`draft_prep`, `submit_after_review`.

**Auto form-fill** maps only the user's *factual* profile data onto an application form,
with three hard rules ([`form_fill.py`](src/jobsearch/engines/assistant/form_fill.py)):

- **Credential fields are refused** — password / SSN / card / passport / bank fields are
  detected and left blank (`blocked`); the user signs in directly with the provider.
- **Nothing is fabricated** — a field with no profile source is left blank and flagged
  `needs_input` for the user.
- **Review-first** — the result is a *plan* the user sees; nothing submits automatically.

**Live browser fill.** `POST /assistant/autofill/{job_id}/execute {submit}` drives a real
browser from the reviewed plan ([`live_fill.py`](src/jobsearch/engines/assistant/live_fill.py)):
open the posting → fill the non-credential values → optionally submit. The safety model is
enforced in the orchestration, not just trusted:

- **Only `filled` non-credential values reach the browser** — `blocked` (credential) entries
  are structurally excluded, so a password/SSN is never passed to the driver.
- **The user's own session.** The driver operates on a Playwright `storage_state` the user
  established themselves; a login wall or CAPTCHA is *detected and escalated* (`needs_login` /
  `captcha`), never solved or bypassed. Unknown required questions → `needs_input`.
- **Approval gate.** `submit` clicks the final button only with the `submit_after_review` scope.

`assistant_browser=mock` (default) simulates the fill so the whole flow is testable/demoable;
`assistant_browser=playwright` (+ the `automation` extra + `assistant_browser_storage_state`)
drives a real browser. Every action is written to an **audit log** (`GET /assistant/actions`).
Endpoints: `GET·PUT /assistant/consent`, `POST /assistant/autofill/{job_id}` (preview, 403 until
`form_autofill`), `POST /assistant/autofill/{job_id}/execute`, `GET /assistant/actions`.

**Auto-prepare drafts.** With the `draft_prep` scope, the assistant generates résumé +
cover-letter **drafts** for the user's strong new matches and notifies them to review
([`draft_prep.py`](src/jobsearch/engines/assistant/draft_prep.py), `POST /assistant/prepare-drafts`).
It skips jobs the user already has an application for, and — since these are drafts — the
existing approval gate still blocks submission until the user approves. A cross-site search
auto-invokes it when the scope is on (the run result carries `drafts_prepared`).

### Standing auto-apply — connected sessions + pre-authorized grants

For hands-off applying, the assistant can submit to whole *groups* of jobs on a
standing pre-authorization — without ever handling a password.

**Connect a session (password stays on your machine).** You run a local helper
that opens a real browser to the provider's login page; **you** log in there
(the password is typed into the provider's own page — the tool never sees it),
and it captures the browser's session cookies:

```bash
python -m jobsearch.connect linkedin --api https://YOUR_API --token YOUR_TOKEN --label "you@email.com"
```

The captured `storage_state` (cookies only) is uploaded and stored **encrypted
at rest** ([`SessionStore`](src/jobsearch/store.py), AES-GCM bound to
`user_id:provider`, mirroring the OAuth token store). The API response never
echoes it back. `POST·GET·DELETE /auto-apply/sessions`.

**Pre-authorize with a grant.** An [`AutoApplyGrant`](src/jobsearch/models/auto_apply.py)
is your explicit, bounded permission to auto-submit — a scope (named `job_ids`
or a `criteria` group: title keywords, locations, remote, company allow/deny,
min match score) plus **hard limits**: a total cap, a per-day cap, an expiry,
and verified-only. The [`AutoApplyEngine`](src/jobsearch/engines/assistant/auto_apply.py)
matches eligible jobs (skipping ones you've already applied to), then submits up
to the smaller of the total/daily budget. `dry_run` previews exactly which jobs
it *would* apply to and changes nothing. `POST /auto-apply/grants`,
`GET /auto-apply/grants`, `PATCH` (pause/resume/revoke), `DELETE`, and
`POST /auto-apply/grants/{id}/run {dry_run, limit}`.

The guardrails hold even here: credential fields are still refused, and a login
wall or CAPTCHA doesn't get solved — it marks the session stale, stops applying
on that provider, and asks you to reconnect. So a grant fails safe rather than
mis-submitting. In `assistant_browser=mock` the whole loop is testable offline;
`playwright` mode uses the connected session for real submission.

**Assisted mode — you click Apply, automation fills the rest.** For
ToS-sensitive providers (LinkedIn is always treated this way, `ASSISTED_PROVIDERS`),
nothing is auto-submitted. Instead the grant *queues* matching jobs; you open
each and click the provider's **Apply** button yourself (a human initiates every
application — the part that matters for ToS/detection), and only then does
automation fill the open form from your factual data, leaving the final Submit to
you. `GET /auto-apply/queue` returns the queued jobs with the exact field values
to type (credentials excluded), and the local helper walks it in a real browser:

```bash
python -m jobsearch.assist --api https://YOUR_API --token YOUR_TOKEN
```

A `criteria` grant that spans providers does both: it auto-submits the Indeed /
Greenhouse matches and queues the LinkedIn ones. Set a grant's `mode` to
`assisted` to force the click-Apply-first flow on every provider.

**Scheduling.** A grant with `interval_minutes > 0` auto-runs on that cadence
(mirroring saved searches). `POST /auto-apply/run-due` runs the caller's due
grants; the host scheduler ([`jobsearch.scheduler`](src/jobsearch/scheduler.py))
runs *everyone's* due grants + saved searches and is wired to a 15-minute cron by
[`deploy/provision.sh`](deploy/provision.sh). Auto grants submit within their
limits on each tick; assisted grants just refresh their apply queue. The Assistant
page also polls `/run-due` every 60s while open (a toggle, on by default) so
scheduled rules tick even without the server cron.

**Staying signed in.** A page left open to run scheduled rules would otherwise
hit the 30-min access-token expiry. [`session.ts`](webapp/src/lib/session.ts)
keeps it warm: a single-flight refresh runs a few minutes before the access token
expires and again the moment the tab regains focus (browsers throttle timers in
background tabs). Because `/auth/refresh` rotates the refresh token, this slides
the 7-day window forward on every refresh — but only up to a **periodic consent
checkpoint**.

**Review & renew checkpoint.** To stop automation running unattended forever on a
one-time grant, the session isn't kept alive indefinitely without a human in the
loop. At the **halfway mark of the 7-day window (~3.5 days)** since the last
explicit sign-in or renewal, `isReviewDue()` trips: the silent refresh **stops
sliding**, the in-page auto-run **pauses**, and a modal
([`SessionReviewModal`](webapp/src/pages/dashboard/components/SessionReviewModal.tsx))
asks the user to review recent automation activity and explicitly renew. Renewing
resets the checkpoint clock (`markReviewed()`), refreshes the token, and resumes;
signing out stops cleanly. So nothing runs unattended for more than half the
window, and the 7-day ceiling on a truly idle session (a security boundary) still
holds beneath it.

**Out-of-band reminders.** The in-app modal only helps if the page is open, so
the checkpoint also nudges the user **when the app is closed**. The consent
anchor is tracked server-side too ([`ReminderEngine`](src/jobsearch/engines/reminders/engine.py));
the host [`scheduler`](src/jobsearch/scheduler.py) checks each user and, once past
the checkpoint (rate-limited so it won't spam), sends a reminder over their chosen
channels: **in-app, email, SMS, and Web Push**. Channels are pluggable and mock by
default (recorded, offline) — set `JOBSEARCH_SMS_PROVIDER=http` (any SMS API) and
`JOBSEARCH_PUSH_PROVIDER=webpush` (VAPID keys + `pip install pywebpush`) to send
for real. Users manage channels + phone and can fire a test in the **Reminders**
panel; the browser subscribes to push via a service worker
([`webapp/public/sw.js`](webapp/public/sw.js)). The client calls `/reminders/renew`
on sign-in and renewal to keep the server anchor in sync. Endpoints:
`GET·PUT /reminders/prefs`, `POST /reminders/push/subscribe·/unsubscribe`,
`POST /reminders/renew`, `POST /reminders/test`.

The same channels also fire on **automation events** — when auto-apply submits,
the user gets a "we applied to N jobs" message (toggle: `notify_on_apply`) — and
an optional **daily digest** (applies, apply-queue size, review status) at a
chosen local hour. **Quiet hours** protect the noisy channels: SMS + push are
suppressed during the user's local night (default 22:00–08:00, in *their*
timezone — the frontend auto-detects and syncs it via `Intl`), while email +
in-app still go through. Timezone math uses `zoneinfo`, so the `tzdata` package
is a dependency (it's absent from Windows and some slim images otherwise).

## Security monitoring (exposure alerts)

A **Security** page lets a user monitor their own email for exposure in known
data breaches — defensive and consent-based, per
[docs/DARKWEB_MONITORING_PLAN.md](docs/DARKWEB_MONITORING_PLAN.md). The flow:
**enroll → verify ownership (one-time code) → scan → alerts**.

- **We never crawl the dark web or buy dumps** — the [`ExposureProvider`](src/jobsearch/engines/monitoring/providers.py)
  port queries a licensed source: `mock` offline, or **Have I Been Pwned** live
  (`JOBSEARCH_EXPOSURE_PROVIDER=hibp` + `HIBP_API_KEY`).
- **Privacy by design** ([`MonitoringEngine`](src/jobsearch/engines/monitoring/engine.py)):
  the email is stored **AES-256-GCM encrypted** (never plaintext); only a one-way
  hash and a masked label (`s**@gmail.com`) are kept in the clear. An identifier
  is **never queried until ownership is verified**. Findings record *what category*
  of data leaked and *where* — **never the leaked secret**.
- Each new finding raises a `SECURITY_EXPOSURE` notification with remediation
  advice; a per-user enrollment cap deters abuse. Endpoints under
  `/api/v1/monitoring` (identifiers/verify/scan/findings).
- The verification code is emailed in production; in dev it's returned in the
  enroll response so the flow is usable without a mail channel.

**Password exposure check (Phase 2, k-anonymity):** the Security page also checks
whether a password appears in known breaches — the **password never leaves the
browser**. The client ([`lib/pwned.ts`](frontend/src/lib/pwned.ts)) computes the
SHA-1, sends only the **first 5 hex chars** to `GET /api/v1/monitoring/password-range/{prefix}`
(which proxies HIBP Pwned Passwords), and matches the remaining hash locally. The
endpoint accepts *only* a 5-char prefix — it structurally cannot receive a
password or full hash — responds `no-store`, and **nothing is persisted**.

A commercial dark-web-intel vendor and remediation UX are later phases (see the plan).

## Persistence (SQL)

By default the platform uses in-memory repositories (great for tests and the
offline demo). Set `JOBSEARCH_DATABASE_URL` to persist to a real database — the
repositories are swapped with an identical method surface, so **no engine or API
handler changes**:

```bash
pip install "sqlalchemy>=2.0"                       # or .[postgres] for Postgres
export JOBSEARCH_ENCRYPTION_KEY=$(python -m jobsearch.security.crypto keygen)  # so tokens decrypt across restarts
export JOBSEARCH_DATABASE_URL=sqlite:///./data/jobsearch.db
#   or: postgresql+psycopg://user:pass@localhost:5432/jobsearch
PYTHONPATH=src python -m jobsearch.api               # /health reports "persistence": "sqlite"
```

Each entity is one table ([`persistence/tables.py`](src/jobsearch/persistence/tables.py))
with a JSON `data` column (Mongo-like schema flexibility) plus promoted, indexed
columns for the fields callers query (`id`, `user_id`, `provider`, `email`).
[`SqlRepository`](src/jobsearch/persistence/sql_repository.py) reconstructs domain
models from the JSON; `build_repositories()` picks in-memory vs. SQL from config.
OAuth tokens stay AES-256-GCM encrypted at rest. Schema is created on startup via
`create_all` (add Alembic for migrations in production). VerificationResults are a
rebuildable cache (recomputed on demand), not a system of record.

> Note: because a real DB returns *copies* (not live references like the
> in-memory store), API handlers persist mutations explicitly with `repo.add()`
> after editing — the correct pattern for any database.

## Live application automation

Submission runs in `simulate` mode by default (synthetic confirmations, no I/O).
The first **live** channel is implemented: **direct email via the user's
connected Gmail** — the safest path (no headless browser, no ToS gray area).

```bash
export JOBSEARCH_AUTOMATION_MODE=live
```

Flow: the user approves their résumé + cover letter (the mandatory gate), submits
with `{"platform": "email"}`; the API fetches the user's decrypted Gmail token
from the integration engine, and [`EmailAdapter._submit_live`](src/jobsearch/engines/automation/adapters.py)
sends an RFC 822 message (cover letter as body, résumé attached) through the
[Gmail send API](src/jobsearch/engines/automation/gmail.py). The recipient is the
posting's `application_email`, else `careers@<company_domain>`. If Gmail isn't
connected or the send fails, the engine returns a **manual fallback** (pre-filled
link + step-by-step instructions) and notifies the user — it never silently drops.

> A real send additionally needs real Google OAuth credentials
> (`GOOGLE_CLIENT_ID`/`SECRET` with the `gmail.send` scope) and the live
> `HttpxTokenExchanger` instead of the mock — see below.

### LinkedIn Easy Apply / Indeed (headless browser)

[`LinkedInAdapter` / `IndeedAdapter`](src/jobsearch/engines/automation/adapters.py)
drive a headless browser ([Playwright](src/jobsearch/engines/automation/browser.py),
in the `automation` extra) for quick-apply flows. Because this is ToS-sensitive
automation, every uncertain branch **degrades safely** instead of risking a wrong
submission:

- **Never enters the user's password** — operates on a browser session the user
  already authenticated (a Playwright `storage_state`); a login wall → manual fallback.
- **Never solves CAPTCHAs** — detects a challenge and escalates it to the user
  (`captcha_required`), as the plan specifies.
- **Never fabricates answers** — fills only factual profile fields (name, email,
  phone, location); any *unknown required question* aborts to a manual fallback.
- Apply button absent, or Playwright not installed → manual fallback, never a crash.

```bash
pip install .[automation] && playwright install chromium
```

> The safety *orchestration* (login/CAPTCHA/unknown-field escalation, no-credential,
> no-fabrication) is fully unit-tested with a fake driver. The Playwright **DOM
> selectors are best-effort** and need validation against real accounts — but
> selector drift degrades to a manual fallback rather than a bad submission.
> Greenhouse/Workday still raise `NotImplementedError` in live mode (→ fallback).

## Live OAuth integrations

Integrations run a **mock** token exchanger offline (fake tokens, no network).
Set `JOBSEARCH_OAUTH_MODE=live` to perform real RFC 6749 token exchange via
[`HttpxTokenExchanger`](src/jobsearch/engines/integration/exchangers.py):

```bash
export JOBSEARCH_OAUTH_MODE=live
export JOBSEARCH_OAUTH_SUCCESS_REDIRECT=http://localhost:3000/integrations
export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...      # Gmail + Google Drive
export LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=...  # etc.
```

- `connect/{provider}` builds the real authorize URL (PKCE where the provider
  supports it) and returns it; the frontend sends the user there.
- `callback/{provider}` exchanges the code, **AES-256-GCM encrypts** the tokens,
  and — when `OAUTH_SUCCESS_REDIRECT` is set — 302-redirects the browser back to
  the frontend (`?connected=` / `?error=`). Tokens auto-refresh on expiry.
- Misconfiguration (live mode, no client id/secret) returns a clear **400** at
  connect; exchange failures surface as a clean error / error-redirect, never a
  raw traceback; a user-denied callback (`?error=access_denied`) is handled.

Once Gmail is connected live, the email automation channel above sends for real.

## Résumé upload

Users can bring their own résumé instead of (or alongside) an AI-generated one.
The **Documents** page has a prominent "⬆ Upload résumé" button (also linked from
the dashboard); `POST /api/v1/resumes/upload` (multipart) stores the file via a
[`DocumentStore`](src/jobsearch/storage.py) and records an `uploaded` résumé,
downloadable at `GET /api/v1/resumes/{id}/file`. When such a résumé is used in an
application, the automation adapters attach the **real uploaded file** (e.g. the
user's PDF) instead of the generated markdown. Storage is in-memory by default;
set `JOBSEARCH_DOCUMENT_DIR` (backed by a volume/S3) for durable files.
Uploaded PDF/DOCX are text-extracted (via the `documents` extra) so they feed
the ATS preview and interview prep.

## Interview prep

The **Interview Prep** page ([`InterviewEngine`](src/jobsearch/engines/interview/engine.py))
suggests likely questions and drafts a suggested answer for each, **grounded in
the user's résumé** (an uploaded PDF/DOCX or a generated one) and optionally
tailored to a target job. Questions are derived deterministically (intro,
motivation, technical, behavioral/STAR, experience, skill-gap, closing); answers
come from the LLM, instructed to use **only facts in the résumé — never
fabricated**. `POST /api/v1/interview/prep` with `{resume_id?, job_posting_id?,
count?}`. Runs offline with the mock LLM; real Claude produces distinct STAR
answers per question.

### Mock interview trainer

The Interview page also has a **Mock Interview** mode: a stateful, conversational
practice interview with an **AI-generated interviewer persona** (name, role,
company, and a style you pick — friendly / formal / technical / skeptical /
behavioral). The interviewer greets you, asks a question, reacts to your answer,
and asks the next one — mimicking a real conversation
([`MockInterviewTrainer`](src/jobsearch/engines/interview/mock_interview.py)).
Each answer is **rated on content and style** —
[`rate_answer`](src/jobsearch/engines/interview/rating.py) scores *structure*
(STAR), *specificity* (metrics/detail), *conciseness*, and *confidence* (filler/
hedging) 0–100 with concrete improvement tips — and the session ends with an
aggregate summary. Endpoints: `POST /interview/mock/start`,
`POST /interview/mock/{id}/reply`, `GET /interview/mock[/{id}]`. Sessions are
persisted. The question progression is deterministic (grounded), the persona/
conversation is LLM-driven, and rating is heuristic (works offline, no LLM).

**Voice + realism** (browser [Web Speech API](frontend/src/lib/speech.ts)): a
"🔊 Voice" toggle has the **interviewer read questions aloud** (SpeechSynthesis),
and a **🎤 Speak** button lets you **answer by voice** (SpeechRecognition, with
live interim transcript). Both feature-detect and fall back to typing where
unsupported. Each answer also records **response time** (shown per-answer and as
a session average), and a **live filler-word counter** nudges you as you compose.

**Adaptive difficulty** — pick Easy / Normal / Hard. On Normal, challenging
personas (skeptical/technical) ask a **probing follow-up** when an answer scores
low; Hard presses harder. The follow-up targets the answer's *weakest* dimension
(e.g. low specificity → "give me a concrete example with a number"). A **past-
interviews** list lets you review completed sessions (with their score) or resume
an in-progress one — sessions are persisted per user.

### Still to do for production
- **Deploy:** a `docker-compose.yml` (Postgres + API + frontend) and an operator
  [runbook](docs/RUNBOOK.md) are included — bring the stack up with one command.
  For scale, add Alembic migrations (schema is `create_all` on startup today) and
  optionally MongoDB/Redis (the JSON-column design already gives doc flexibility).
- Validate the LinkedIn/Indeed Playwright selectors against real accounts and wire
  per-user authenticated `storage_state`; implement `_submit_live` for Greenhouse/Workday.
- Provide real domain-age / scam-DB providers behind verification's context.
- Register OAuth apps with each provider to obtain the client id/secret above
  (the exchange machinery is done — this is account/console setup).

## Layout

```
src/jobsearch/
  config.py                 # env-driven settings
  models/                   # domain entities (§4 of the plan)
  llm/                      # provider-agnostic LLM + embeddings (+ mocks)
  security/crypto.py        # AES-256-GCM field encryption
  store.py                  # in-memory repos + encrypted token store
  engines/
    integration/            # engine 1 — OAuth
    generation/             # engine 2 — résumé/cover letter (+ ats.py)
    matching/               # engine 3 — ranking (+ scoring.py, feedback.py)
    verification/           # engine 4 — fraud scoring (+ signals.py)
    automation/             # engine 5 — submission (+ adapters.py)
  platform.py               # facade wiring all five engines
  api/                      # FastAPI web layer (§5 endpoints, JWT RS256)
    app.py                  #   create_app() factory
    security.py             #   PBKDF2 + JWT RS256
    state.py                #   repos + wired engines
    deps.py, schemas.py     #   DI + request/response DTOs
    routers/                #   auth, users, integrations, jobs, documents, applications, notifications
examples/demo.py            # runnable offline end-to-end walkthrough
tests/                      # 38 tests, all offline (engines + API)
```

## Mapping to the plan

| Plan section | Where it lives |
|--------------|----------------|
| §4 Data Model | `jobsearch/models/` |
| §6.1 Integration Module | `engines/integration/` |
| §6.2 Generation Module + human gate | `engines/generation/` |
| §6.3 Matching Module + RL feedback | `engines/matching/` |
| §6.4 Authenticity Verification | `engines/verification/` |
| §6.5 Application Automation + safety controls | `engines/automation/` |
| §7 Security (AES-256, least-privilege scopes) | `security/crypto.py`, `engines/integration/providers.py` |

## Status

Phase-1/2 engine layer, offline-complete and tested. Not yet built: the HTTP/API
layer, real persistence, live automation adapters (`_submit_live`), and the
external data lookups behind verification (domain-age/scam-DB providers) — all
have defined seams to plug into.
