# Project Harbor Connect — Privacy Policy

_Last updated: 2026-09-16_

Project Harbor Connect is a browser extension that lets you connect a job site (such as
LinkedIn or Indeed) to your Project Harbor account so Project Harbor's assistant can act on
that site on your behalf. This policy explains exactly what the extension accesses,
what it sends, and what it never touches.

## What the extension does

When **you** click **Connect this site** in the extension popup, it:

1. Reads the **session cookies** the job site already set in this browser after
   *you* logged in on that site's own page.
2. Packages those cookies into a session bundle (a Playwright `storage_state`).
3. Sends that bundle over HTTPS to the Project Harbor API, matched to a short-lived,
   single-use **pairing code** you copied from the Project Harbor app.

The extension takes **no action on its own**. It reads cookies only in direct
response to your click, only for the job site you select, and only when you have
supplied a valid pairing code.

## What it accesses and why

- **Cookies** (`cookies` permission, limited to the job-site domains listed in the
  manifest) — to capture the authenticated session so Project Harbor can apply for you.
- **Active tab URL** (`tabs` permission) — only to auto-detect which supported job
  site you are on, so the correct provider is pre-selected. No browsing history is
  read or stored.
- **Local storage** (`storage` permission) — to remember the Project Harbor API base URL
  you set (defaults to the production Project Harbor API). Stored only in this browser.

## What it NEVER accesses

- **Your passwords.** The extension never reads, stores, or transmits any password
  or login credential. You authenticate directly with the job site; the extension
  only reads the resulting session cookies.
- **Your Project Harbor login token.** The pairing code — not your Project Harbor credentials —
  authorizes attaching the session.
- Cookies or data from any site other than the supported job sites you explicitly
  connect.

## What is sent, where, and how it is stored

- **Sent:** the selected job site's session cookies + the pairing code + an optional
  label you type, to `POST /api/v1/auto-apply/sessions/connect` on the Project Harbor API,
  over HTTPS.
- **Stored by Project Harbor:** the session is stored **encrypted at rest** and is used
  solely to perform actions you request (e.g. submitting applications). It is scoped
  to your account.
- **Stored by the extension locally:** only the Project Harbor API base URL. No cookies or
  session data are retained in the extension after they are sent.

## Data sharing

Project Harbor does not sell your data and does not share captured sessions with third
parties. Sessions are transmitted only to the Project Harbor API you point the extension
at.

## Your control

- The extension acts only when you click Connect.
- Pairing codes are single-use and expire (about 10 minutes).
- You can disconnect a site at any time from the Project Harbor app, which invalidates the
  stored session.
- Removing the extension stops all access immediately.

## Contact

For questions about this policy or your data, contact the Project Harbor team at the
address published on the Project Harbor website.
