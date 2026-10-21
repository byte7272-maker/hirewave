# Make email forwarding work in production (no OAuth, no passwords)

Forwarding is the easiest onboarding path for external users: each user gets a unique
address `jobs+<token>@<your-inbox-domain>`, sets a forward/filter in their own email, and
their job alerts flow into matches — **no Google verification, no app passwords, no
credentials stored**.

The app side is built: `GET /api/v1/inbox/address` (per-user address) and
`POST /api/v1/inbox/inbound` (webhook). The inbound webhook now accepts **JSON or
form** bodies and the common field names from SendGrid / Mailgun / Postmark / Cloudflare,
and takes the shared secret via the **`X-Inbox-Secret` header or a `?secret=` query param**.
What's left is infrastructure: a domain for inbound mail + an inbound-email provider.

Production base URL: `https://hirewave-production-3db3.up.railway.app`

## 1. Pick an inbound-mail domain
Use a domain (or subdomain) you control just for receiving, e.g. **`inbox.hirewave.app`**.
You'll point its **MX** records at your provider and give users addresses on it.

## 2. Choose an inbound-email provider + point MX at it
Any of these work with the webhook as-is:
- **SendGrid Inbound Parse** (free tier) — MX → `mx.sendgrid.net`; posts multipart form
  with `to`, `from`, `subject`, `text`, `html`, `envelope`, and (enable **"POST the raw,
  full MIME message"**) `email`. Can't add custom headers → use the `?secret=` query.
- **Mailgun Routes** — MX → Mailgun; posts form (`recipient`, `sender`, `subject`,
  `body-plain`, `body-html`, `body-mime`).
- **Postmark inbound** — MX → Postmark; posts **JSON** (`To`, `From`, `Subject`,
  `TextBody`, `HtmlBody`, `RawEmail`). Supports a custom header for the secret.
- **Cloudflare Email Routing + Email Worker** — free; a small Worker forwards the message
  as JSON to the webhook.

## 3. Point the provider's inbound/parse at the webhook
Set the destination URL to:
```
https://hirewave-production-3db3.up.railway.app/api/v1/inbox/inbound?secret=<YOUR_SECRET>
```
(or omit `?secret=` and set header `X-Inbox-Secret: <YOUR_SECRET>` if the provider supports
custom headers, e.g. Postmark). Route **all** mail for the inbox domain to it.

## 4. Railway variables
```
JOBSEARCH_INBOX_DOMAIN=inbox.hirewave.app
JOBSEARCH_INBOX_WEBHOOK_SECRET=<YOUR_SECRET>   # same secret you put in the webhook URL/header
```
Redeploy. Now `GET /inbox/address` returns `jobs+<token>@inbox.hirewave.app`.

## 5. The user's one step
In the UI (P13's "Forward your job alerts here"), the user copies their
`jobs+<token>@inbox.hirewave.app` address and adds a **forward or filter** in their email
(e.g. Gmail → Settings → Forwarding, or a filter that forwards messages from job boards to
that address). From then on, alerts are classified (job-only) and ingested into matches.

## Verify
- Send/forward a real job-alert email to a user's `jobs+<token>@…` address.
- The provider POSTs it to `/inbox/inbound`; response `{"accepted": true, "ingested": N}`.
- It appears in `GET /api/v1/inbox` and the roles show in `GET /api/v1/jobs/matches`.
- Security: a POST with a wrong/missing secret returns **401**; an unknown recipient returns
  `{"accepted": false}` (so the endpoint can't be used to probe which addresses exist).

## Why this is the easy on-ramp
No Google OAuth verification, no app passwords, nothing sensitive stored — just a forward
rule the user already knows how to make. Pair it with "Connect Gmail" (OAuth) as the
one-click option once the app completes Google verification; forwarding covers everyone in
the meantime.
