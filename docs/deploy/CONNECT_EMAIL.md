# Connecting an email account to feed job matches

The app can pull job email into the match pool three ways. All are built; they only need
configuration + (for A) a Google OAuth app.

- **C — Per-user iCloud (IMAP, app-specific password).** Each user connects **their own**
  iCloud inbox from the UI with their email + an Apple app-specific password. No
  deployment-wide config, no Google app — works out of the box. Best coverage for the
  iPhone/Mac user base. See section C.
- **B — User-preference feed (forwarding / IMAP).** The user decides what comes in: they
  forward job alerts to their in-app address, or the deployment connects **one** dedicated
  mailbox over IMAP, and a **Scan** (or the schedule) pulls it. No Google app needed.
- **A — Proactive fetch (Gmail OAuth).** The user clicks **Connect Gmail**, grants
  read-only access once, and the scheduler then fetches job email proactively. This needs
  a Google Cloud OAuth client and live mode.

> **Why "Connect" looks broken today:** production runs the default `JOBSEARCH_OAUTH_MODE=mock`
> with no Google client id, so the Gmail **Connect** button builds a real Google URL with an
> **empty `client_id`** and Google shows an error page. Until A is configured, the UI reads
> `oauth_available:false` (from `GET /api/v1/integrations/connected-apps`) and should hide/disable
> Connect and offer B instead. Nothing about the user's account is wrong.

Production base URL used below: `https://hirewave-production-3db3.up.railway.app`

---

## B — Forwarding / IMAP (no Google app)

### B1. Dedicated IMAP mailbox (recommended for a single account, e.g. byte7272)
Use a Gmail **app password** (not the real password) so no OAuth app is needed:
1. On the Google account, enable 2-Step Verification, then create an **App password**
   (Google Account → Security → App passwords) for "Mail".
2. Set on Railway (service → Variables):
   ```
   JOBSEARCH_JOB_MAILBOX=imap
   JOBSEARCH_JOB_MAILBOX_HOST=imap.gmail.com
   JOBSEARCH_JOB_MAILBOX_PORT=993
   JOBSEARCH_JOB_MAILBOX_USER=byte7272@gmail.com
   JOBSEARCH_JOB_MAILBOX_PASSWORD=<the 16-char app password>
   JOBSEARCH_JOB_MAILBOX_FOLDER=INBOX
   ```
3. Redeploy. Now **`POST /api/v1/inbox/scan?source=mailbox`** (the "Scan" action) pulls that
   mailbox, classifies to **job email only** (privacy gate), and ingests postings into the
   match pool. This is the user-triggered "preference" feed.

> The dedicated mailbox is one account for the deployment — fine for a single user. It is
> read **only** when a scan runs; nothing personal is imported (non-job mail is dropped).

### B2. Forwarding address (zero mailbox setup)
Each user has a forwarding address from **`GET /api/v1/inbox/address`** →
`jobs+<token>@<inbox_domain>`. To receive forwarded mail in production you also need a real
inbox domain and an inbound-email provider (SendGrid/Postmark/Mailgun) POSTing to
`POST /api/v1/inbox/inbound`:
```
JOBSEARCH_INBOX_DOMAIN=inbox.yourdomain.com        # a domain you control, MX → the provider
JOBSEARCH_INBOX_WEBHOOK_SECRET=<shared secret>     # set the same on the provider's webhook
```
Point the provider's inbound webhook at `…/api/v1/inbox/inbound` with header
`X-Inbox-Secret: <secret>`. Until a domain + provider are wired, the forwarding address is
shown but won't receive mail — prefer B1 for a quick setup.

---

## C — iCloud Mail (per-user, app-specific password) — nothing to configure

Unlike A/B, this needs **no deployment config and no Google app** — each user connects their
own iCloud inbox from the UI. iCloud doesn't support OAuth, so the user supplies an Apple
**app-specific password** (their normal Apple ID password won't work over IMAP once 2FA is on).

**What the user does (in-app, P69 UI):**
1. Go to **appleid.apple.com** → **Sign-In & Security → App-Specific Passwords** → generate
   one for "Hirewave".
2. In Hirewave's **Connect email** area, open **iCloud Mail**, enter the iCloud email + that
   app-specific password, and connect.

**What happens server-side:**
- **`POST /api/v1/integrations/connect-imap`** `{ "provider":"icloud", "email":…, "app_password":… }`
  does a live IMAP login to `imap.mail.me.com:993` to validate, then stores the password
  **encrypted at rest** (same AES-GCM field as OAuth tokens), keyed to the user. A bad
  credential returns an actionable **400** and stores nothing.
- The mailbox is then scanned/reaped exactly like Gmail: **`POST /api/v1/inbox/scan?source=icloud`**
  for an immediate pull, and the scheduler's per-tick reap keeps matches fresh (same privacy
  gate — only job email is ingested). A user can connect more than one iCloud address;
  **`DELETE /api/v1/integrations/icloud`** disconnects.

**Optional config (defaults are fine):**
```
JOBSEARCH_IMAP_VERIFY_ON_CONNECT=true   # default; set false only to skip the live login check
JOBSEARCH_SCHEDULER_ENABLED=true        # needed for the automatic per-tick reap (same as A3)
```
No host/credential vars are needed — host/port/folder for iCloud are built in, and each
user's own password is what's used.

> Discovery: **`GET /api/v1/integrations/imap-providers`** returns the connectable IMAP hosts
> (currently iCloud) with the app-password URL + help text the UI renders. In
> **`connected-apps`**, iCloud shows `imap_connectable:true` and, once connected,
> `method:"imap"` with the account email.

---

## A — Gmail OAuth (proactive fetch, user-approved)

### A1. Create the Google OAuth client
1. Google Cloud Console → create/select a project.
2. **APIs & Services → Enable APIs** → enable **Gmail API**.
3. **OAuth consent screen**: External; app name + support email; add scope
   **`https://www.googleapis.com/auth/gmail.readonly`**; add **byte7272@gmail.com** as a
   **Test user** (so it works before Google verification).
4. **Credentials → Create credentials → OAuth client ID → Web application.** Add the
   **Authorized redirect URI**:
   ```
   https://hirewave-production-3db3.up.railway.app/api/v1/integrations/callback/gmail
   ```
5. Copy the **Client ID** and **Client secret**.

### A2. Configure Railway
```
JOBSEARCH_OAUTH_MODE=live
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
JOBSEARCH_OAUTH_REDIRECT_BASE=https://hirewave-production-3db3.up.railway.app/api/v1/integrations/callback
```
Redeploy. `connected-apps` will now report `oauth_available:true` for gmail, so the UI shows
**Connect Gmail**. Clicking it → Google consent → returns connected. (In live mode with the
vars missing, Connect fails gracefully with "gmail OAuth is not configured" instead of a
Google error page.)

### A3. Turn on the proactive fetch
The scheduler is what reaps connected Gmail on a cadence; it's **off by default**:
```
JOBSEARCH_SCHEDULER_ENABLED=true
JOBSEARCH_SCHEDULER_INTERVAL_SECONDS=900     # every 15 min (tune as desired)
```
(Or run the worker / a cron of `python -m jobsearch.scheduler` — see `scheduler.py`.) With
this on and Gmail connected, each tick pulls the user's job email into matches.

---

## Verify
- `GET /api/v1/integrations/connected-apps` → gmail `oauth_available` reflects A being set;
  icloud shows `imap_connectable:true`.
- **C:** `POST /api/v1/integrations/connect-imap` with a valid iCloud email + app password →
  `{connected:"icloud", account_email}`; then `POST /api/v1/inbox/scan?source=icloud` returns
  `fetched`/`job_found`/`ingested`. A wrong password → 400 with an actionable detail.
- **B:** `POST /api/v1/inbox/scan?source=mailbox` returns `fetched`/`job_found`/`ingested` and
  the new postings appear in `GET /api/v1/jobs/matches`.
- **A:** after Connect, `connected-apps` shows gmail `status:"connected"`; with the scheduler
  on, matches refresh from email on the cadence (freshness cue updates).
