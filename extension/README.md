# Hirewave Connect — browser extension

One-click way to connect a job site to Hirewave, as an alternative to the
`python -m jobsearch.connect` CLI. No terminal, no Playwright.

It reads **only the session cookies** the site set after *you* logged in on the
provider's own page (extensions can read httpOnly cookies via `chrome.cookies`,
which a web page/bookmarklet cannot), packages them as a Playwright
`storage_state`, and submits them to Hirewave against the short-lived **pairing
code** from the app. Your password is never read or sent.

## Install

**End users:** install from the Chrome Web Store / Microsoft Edge Add-ons (the
Hirewave "Connect a site" screen links to it). The browser handles install and
auto-updates. See `STORE_LISTING.md` for the submission kit and `build.py` to
package a store-ready zip.

**Developers (unpacked):**
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the **Hirewave Connect** icon to the toolbar.

## Use

1. In Hirewave → **Authenticated Apps**, click **Connect** on a site to get a
   **pairing code**.
2. Make sure you're **logged into that site in this browser** (log in on the
   site's own page if not).
3. Click the **Hirewave Connect** toolbar icon. It auto-detects the site from the
   active tab; paste the pairing code and click **Connect this site**.
4. Hirewave flips the site to **Connected** — the assistant now has access.

## What it sends
- The site's session cookies (`storage_state`), over HTTPS, to
  `POST /api/v1/auto-apply/sessions/connect` with the pairing code. Stored
  **encrypted at rest**.
- **Never** your password, and never your Hirewave login token — the pairing code
  authorizes the attach.

## Notes
- Supported sites: LinkedIn, Indeed, Glassdoor, Greenhouse, Workday, ZipRecruiter,
  Dice. The cookie domains and the API host are declared in `manifest.json`
  `host_permissions`.
- To point at a non-production Hirewave, set the API base under **Advanced** in the
  popup (persisted per browser).
- Branded icons (16/32/48/128) are in `icons/` and declared in the manifest.
- Packaging: `python extension/build.py` -> `extension/dist/project-harbor-connect-<version>.zip`.
- Store submission: `STORE_LISTING.md` (copy + permission justifications); privacy
  policy in `PRIVACY.md` (host it publicly and put the URL in both listings).
