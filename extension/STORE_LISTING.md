# Hirewave Connect — Store Submission Kit

Copy-paste content for the Chrome Web Store and Microsoft Edge Add-ons listing +
review forms. Both stores ask for the same substance (listing copy, a single-
purpose statement, per-permission justifications, and data-use disclosures).

---

## Listing basics

- **Name:** Hirewave Connect
- **Summary (<=132 chars):** Companion for Hirewave -- connect a job board you already use so the assistant can help you apply. Session only, never your password.
- **Category:** Productivity
- **Language:** English
- **Homepage / support URL:** https://hlrtlg.readdy.co
- **Privacy policy URL:** _host `privacy.html` at a public URL and paste it here_ (required -- this extension uses the `cookies` permission)

## Detailed description

_(Rejected v1.1.0 for "excessive keywords" -- the old copy listed every supported
site by name. This version drops that list and frames the extension as a helper
that works alongside the job boards you already use, not an alternative to them.)_

> Hirewave Connect is the companion browser extension for Hirewave, your
> AI application assistant.
>
> Keep the job boards you already use. When you choose to connect a site you're
> signed in to, the extension reads only that site's existing session (its cookies)
> and hands it to your Hirewave account over a secure connection, so the
> assistant can help you tailor your resume and apply -- with you approving every
> step. You stay logged in on the site's own page; the extension never sees, stores,
> or transmits your password.
>
> It works alongside the sites you already use -- it is not a replacement for them.
> You keep signing in to and using each site directly, and every listing and its
> content belong to that site.
>
> Why install it:
> - A helper, not autopilot: Hirewave prepares applications; you approve every
>   apply.
> - One connection: sign in on the site once, then connect it in a click.
> - Private by design: your session only, never your password; it acts only when you
>   ask, and you can disconnect any site at any time.
>
> You'll need a Hirewave account to use this extension.

## How it works

1. In Hirewave, open **Connect a site** and choose a job site.
2. Make sure you're logged into that site in this browser.
3. The extension attaches your existing session automatically -- no code to copy.
   (If prompted, you can also open the extension popup and paste a one-time pairing
   code shown in the app.)

## Single-purpose statement (required)

_(Paste verbatim into the dashboard's "Single purpose description" field.)_

> Hirewave Connect connects a job site the user is already logged into (e.g.,
> LinkedIn, Indeed) to the user's own Hirewave account, so Hirewave's assistant can
> help the user apply for jobs and keep their resume updated on that site. When the
> user chooses to connect a site, the extension reads only that site's existing
> session cookies and sends them to the user's Hirewave account over HTTPS. It never
> reads or transmits passwords — the user authenticates directly on the job site.
> Capturing an existing job-site session on request and handing it to the user's own
> Hirewave account is the extension's only function.

## Permission justifications (required -- one per permission)

_(Paste each into the matching dashboard field.)_

- **cookies** -- The extension reads the session cookies of the specific job site the
  user chooses to connect so the authenticated session can be sent to the user's own
  Hirewave account. This is the core and only function; without the cookies permission
  the extension cannot capture the session and connect the site. Cookies are read only
  in direct response to the user's action, only for the single site they select, and
  are sent over HTTPS to the user's account. Passwords are never read.
- **tabs** -- The tabs permission is used only to read the active tab's URL to
  auto-detect which supported job site the user is currently on, so the correct site
  is pre-selected in the connect UI. No browsing history is collected, stored, or
  transmitted, and no other tab data is accessed. The URL is used ephemerally on the
  client for provider detection only.
- **storage** -- The storage permission persists one local setting — the Hirewave API
  base URL the extension talks to (defaulting to the production API). It is stored only
  in the user's browser via chrome.storage.local, is never synced or transmitted, and
  contains no personal data. It exists so the user does not have to re-enter the endpoint.
- **host permission** -- Two kinds of hosts are requested. (1) The supported job-site
  domains (LinkedIn, Indeed, Glassdoor, Greenhouse, Workday, ZipRecruiter, Dice) —
  required to read the session cookies of the specific site the user chooses to connect.
  (2) The Hirewave API host and app origin — the API host is where the captured session
  is sent over HTTPS to the user's account; the app origin is where a content script sets
  a marker so the app knows the extension is installed and relays the user's connect
  request. Each host is necessary for the connect flow; no other sites are accessed.

## Data-use disclosures (Chrome "Privacy practices" / Edge data collection)

Answer the store forms as follows:

- **What user data is collected?** Authentication information -- specifically the
  session cookies of the job site the user explicitly connects. (No passwords.)
- **Is data sold to third parties?** No.
- **Is data used or transferred for purposes unrelated to the item's single
  purpose?** No.
- **Is data used to determine creditworthiness / for lending?** No.
- **Sensitive permissions justification:** see the `cookies` justification above.
- **Certify** the disclosures are accurate and that use complies with the store's
  Limited Use / User Data policies.

## Assets checklist (what the upload form asks for)

- [x] **Store icon 128x128** -- `extension/icons/icon128.png`.
- [x] **Screenshot 1280x800** (at least one required) -- `extension/store-assets/screenshot-1280x800.png`.
- [x] **Small promo tile 440x280** (optional) -- `extension/store-assets/promo-440x280.png`.
- [x] Packaged icons 16/32/48/128 (`extension/icons/`, referenced in the manifest).
- [ ] **Privacy policy hosted at a public URL** (from `privacy.html`) -- REQUIRED.

## Submission steps

**Chrome Web Store** (developer.chrome.com/docs/webstore) -- one-time $5 developer
registration if you've never published.
1. Run `python extension/build.py` to produce `extension/dist/hirewave-connect-<version>.zip`.
2. Chrome Web Store Developer Dashboard -> **New item** -> upload the zip (this
   creates the item and assigns the extension ID).
3. Fill in the listing copy, single-purpose statement, permission justifications, and
   privacy-practices form above; add the privacy-policy URL, the 128x128 icon, and a
   1280x800 screenshot.
4. Submit for review (typically hours to a few days).

**Microsoft Edge Add-ons** (partner.microsoft.com/dashboard/microsoftedge) -- free.
1. Upload the same zip.
2. Provide the same listing copy + permission justifications + privacy-policy URL.
3. Submit for certification.

## After it's published

- Grab the item's public URL/ID from the dashboard and put the store URL into the
  Hirewave "Connect a site" install button (see `docs/READDY_CONNECT_EXTENSION.md`).
- On each new release, bump `manifest.json` `version`, re-run `build.py`, and upload
  the new zip; the stores push auto-updates to installed users.
