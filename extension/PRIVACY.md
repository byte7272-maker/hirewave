# Hirewave Connect — Privacy Policy

_Last updated: 2026-09-28_

Hirewave Connect is a browser extension that lets you connect a job site (such as
LinkedIn or Indeed) to your Hirewave account so Hirewave's assistant can act on
that site on your behalf. This policy explains exactly what the extension accesses,
what it sends, and what it never touches.

## What the extension does

When **you** start a connect (either by clicking **Connect this site** in the
extension popup, or by clicking **Connect** in the Hirewave web app), it:

1. Reads the **session cookies** the job site already set in this browser after
   *you* logged in on that site's own page.
2. Packages those cookies into a session bundle (a Playwright `storage_state`).
3. Sends that bundle over HTTPS to the Hirewave API, authorized either by a
   short-lived, single-use **pairing code** you copied from the app, **or** by your
   own current app sign-in when you start the connect from the app itself (below).

The extension takes **no action on its own**. It reads cookies only in direct
response to your action, only for the job site you select.

### Connecting from the app (no pairing code)

For a smoother flow, the Hirewave web app can start the connect for you: from
the app's "Connect a site" screen, the app asks this extension to attach the
selected site. This request is relayed only by the extension's content script,
which runs solely on the Hirewave app's own web address (declared in the
manifest). To perform that one request, the app hands the extension **your own
current, short-lived session token** — used a single time for that call and **not
stored** by the extension. This replaces the manual pairing code; nothing else
about what is read or sent changes.

## What it accesses and why

- **Cookies** (`cookies` permission, limited to the job-site domains listed in the
  manifest) — to capture the authenticated session so Hirewave can apply for you.
- **Active tab URL** (`tabs` permission) — only to auto-detect which supported job
  site you are on, so the correct provider is pre-selected. No browsing history is
  read or stored.
- **Local storage** (`storage` permission) — to remember the Hirewave API base URL
  you set (defaults to the production Hirewave API). Stored only in this browser.

## What it NEVER accesses

- **Your passwords.** The extension never reads, stores, or transmits any password
  or login credential. You authenticate directly with the job site; the extension
  only reads the resulting session cookies.
- **Your Hirewave password.** Attaching a session is authorized by a pairing
  code, or (when you start from the app) by your own short-lived session token that
  the app passes for that single call and the extension does not store — never your
  password.
- Cookies or data from any site other than the supported job sites you explicitly
  connect.

## What is sent, where, and how it is stored

- **Sent:** the selected job site's session cookies + the pairing code + an optional
  label you type, to `POST /api/v1/auto-apply/sessions/connect` on the Hirewave API,
  over HTTPS.
- **Stored by Hirewave:** the session is stored **encrypted at rest** and is used
  solely to perform actions you request (e.g. submitting applications). It is scoped
  to your account.
- **Stored by the extension locally:** only the Hirewave API base URL. No cookies or
  session data are retained in the extension after they are sent.

## Data sharing

Hirewave does not sell your data and does not share captured sessions with third
parties. Sessions are transmitted only to the Hirewave API you point the extension
at.

## Your control

- The extension acts only when you click Connect.
- Pairing codes are single-use and expire (about 10 minutes).
- You can disconnect a site at any time from the Hirewave app, which invalidates the
  stored session.
- Removing the extension stops all access immediately.

## Contact

For questions about this policy or your data, contact the Hirewave team at the
address published on the Hirewave website.
