# Project Harbor Connect — Store Submission Kit

Copy-paste content for the Chrome Web Store and Microsoft Edge Add-ons listing +
review forms. Both stores ask for the same substance (listing copy, a single-
purpose statement, per-permission justifications, and data-use disclosures).

---

## Listing basics

- **Name:** Project Harbor Connect
- **Summary (<=132 chars):** Companion for Project Harbor -- connect a job board you already use so the assistant can help you apply. Session only, never your password.
- **Category:** Productivity
- **Language:** English
- **Homepage / support URL:** https://hlrtlg.readdy.co
- **Privacy policy URL:** _host `privacy.html` at a public URL and paste it here_ (required -- this extension uses the `cookies` permission)

## Detailed description

_(Rejected v1.1.0 for "excessive keywords" -- the old copy listed every supported
site by name. This version drops that list and frames the extension as a helper
that works alongside the job boards you already use, not an alternative to them.)_

> Project Harbor Connect is the companion browser extension for Project Harbor, your
> AI application assistant.
>
> Keep the job boards you already use. When you choose to connect a site you're
> signed in to, the extension reads only that site's existing session (its cookies)
> and hands it to your Project Harbor account over a secure connection, so the
> assistant can help you tailor your resume and apply -- with you approving every
> step. You stay logged in on the site's own page; the extension never sees, stores,
> or transmits your password.
>
> It works alongside the sites you already use -- it is not a replacement for them.
> You keep signing in to and using each site directly, and every listing and its
> content belong to that site.
>
> Why install it:
> - A helper, not autopilot: Project Harbor prepares applications; you approve every
>   apply.
> - One connection: sign in on the site once, then connect it in a click.
> - Private by design: your session only, never your password; it acts only when you
>   ask, and you can disconnect any site at any time.
>
> You'll need a Project Harbor account to use this extension.

## How it works

1. In Project Harbor, open **Connect a site** and choose a job site.
2. Make sure you're logged into that site in this browser.
3. The extension attaches your existing session automatically -- no code to copy.
   (If prompted, you can also open the extension popup and paste a one-time pairing
   code shown in the app.)

## Single-purpose statement (required)

> The single purpose of this extension is to capture the user's existing job-site
> login session (cookies) and hand it to the user's own Project Harbor account, so
> Project Harbor can help the user apply for jobs and keep their resume updated on
> that site. It is authorized either by the user's current app sign-in (when started
> from the Project Harbor web app) or by a one-time pairing code.

## Permission justifications (required -- one per permission)

- **cookies** -- Reads the session cookies of the single job site the user chooses
  to connect, so that authenticated session can be handed to the user's Project
  Harbor account. This is the core function; without it the extension cannot connect
  a site. (The specific host domains are listed under the host-permission
  justification below.)
- **tabs** -- Reads only the active tab's URL to auto-detect which supported job site
  the user is on and pre-select the correct provider. No browsing history is
  collected.
- **storage** -- Persists the Project Harbor API base URL the user configures
  (defaults to the production Project Harbor API). Local to the browser.
- **host_permissions (the job-site domains + the Project Harbor API host)** -- The
  job-site domains are the sites whose sessions the user can connect; the Project
  Harbor API host is where the captured session is sent. Each host is required for
  that site's connect flow.
- **content script + background service worker (on the Project Harbor app origins
  only)** -- The content script runs only on the Project Harbor web app: it marks the
  app so it knows the extension is installed, and relays the user's connect request
  (chosen provider) to the background worker, which reads the cookies and sends them.
  It reads nothing else from the page and transmits nothing on its own.

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
1. Run `python extension/build.py` to produce `extension/dist/project-harbor-connect-<version>.zip`.
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
  Project Harbor "Connect a site" install button (see `docs/READDY_CONNECT_EXTENSION.md`).
- On each new release, bump `manifest.json` `version`, re-run `build.py`, and upload
  the new zip; the stores push auto-updates to installed users.
