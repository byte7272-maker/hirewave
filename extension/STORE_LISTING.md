# Project Harbor Connect — Store Submission Kit

Copy-paste content for the Chrome Web Store and Microsoft Edge Add-ons listing +
review forms. Both stores ask for the same substance (listing copy, a single-
purpose statement, per-permission justifications, and data-use disclosures).

---

## Listing basics

- **Name:** Project Harbor Connect
- **Summary (≤132 chars):** Connect a job site to Project Harbor so the assistant can apply for you — captures your session (cookies only, never your password).
- **Category:** Productivity
- **Language:** English
- **Homepage / support URL:** https://hlrtlg.readdy.co
- **Privacy policy URL:** _host `PRIVACY.md` at a public URL and paste it here_ (required — this extension uses the `cookies` permission)

## Detailed description

> Project Harbor Connect links a job site (LinkedIn, Indeed, Glassdoor, Greenhouse,
> Workday, ZipRecruiter, Dice) to your Project Harbor account so Project Harbor's assistant can
> submit applications on your behalf.
>
> **How it works**
> 1. In Project Harbor, click **Connect** on a job site to get a short pairing code.
> 2. Make sure you're logged into that site in this browser.
> 3. Click the Project Harbor Connect icon, paste the code, and click **Connect this site**.
>
> The extension reads **only the session cookies** the site set after *you* logged
> in, packages them, and sends them to Project Harbor against your one-time pairing code.
>
> **It never reads or sends your password.** You log in directly with the job site;
> the extension only captures the resulting session, and only when you click Connect.
> Sessions are stored encrypted and used solely for the actions you request. You can
> disconnect any site from Project Harbor at any time.

## Single-purpose statement (required)

> The single purpose of this extension is to capture the user's existing job-site
> login session (cookies) and hand it to the user's Project Harbor account, authorized by
> a one-time pairing code, so Project Harbor can perform job applications the user requests.

## Permission justifications (required — one per permission)

- **cookies** — Reads the session cookies of the job site the user chooses to
  connect, so the authenticated session can be handed to Project Harbor. This is the core
  function; without it the extension cannot connect a site.
- **tabs** — Reads only the active tab's URL to auto-detect which supported job site
  the user is on and pre-select the correct provider. No browsing history is
  collected.
- **storage** — Persists the Project Harbor API base URL the user configures (defaults to
  the production Project Harbor API). Local to the browser.
- **host_permissions (the job-site domains + the Project Harbor API host)** — The job-site
  domains are the sites whose sessions the user can connect; the Project Harbor API host is
  where the captured session is sent. Each host is required for that site's connect
  flow.
- **content script (on the Project Harbor app origins only)** — A tiny script runs on the
  Project Harbor web app to set a marker so the app knows the extension is installed and can
  skip the install prompt. It reads nothing from the page and transmits nothing.

## Data-use disclosures (Chrome "Privacy practices" / Edge data collection)

Answer the store forms as follows:

- **What user data is collected?** Authentication information — specifically the
  session cookies of the job site the user explicitly connects. (No passwords.)
- **Is data sold to third parties?** No.
- **Is data used or transferred for purposes unrelated to the item's single
  purpose?** No.
- **Is data used to determine creditworthiness / for lending?** No.
- **Sensitive permissions justification:** see the `cookies` justification above.
- **Certify** the disclosures are accurate and that use complies with the store's
  Limited Use / User Data policies.

## Assets checklist

- [x] Icons 16/32/48/128 (`extension/icons/`, referenced in the manifest).
- [x] Store icon 128×128 (use `icons/icon128.png`).
- [x] Screenshot 1280×800 (`extension/store-assets/screenshot-1280x800.png`).
- [x] (Chrome) Small promo tile 440×280 (`extension/store-assets/promo-440x280.png`).
- [ ] Privacy policy hosted at a public URL (from `PRIVACY.md` / `privacy.html`).

## Submission steps

**Chrome Web Store** (developer.chrome.com/docs/webstore) — one-time $5 developer
registration.
1. Run `python extension/build.py` to produce `extension/dist/project-harbor-connect-<version>.zip`.
2. Chrome Web Store Developer Dashboard → **New item** → upload the zip.
3. Fill in the listing copy, single-purpose statement, permission justifications, and
   privacy-practices form above; add the privacy-policy URL and a screenshot.
4. Submit for review (typically a few days).

**Microsoft Edge Add-ons** (partner.microsoft.com/dashboard/microsoftedge) — free.
1. Upload the same zip.
2. Provide the same listing copy + permission justifications + privacy-policy URL.
3. Submit for certification.

## After it's published

- Put the store URLs into Project Harbor's "Connect a site" screen (see
  `docs/READDY_CONNECT_EXTENSION.md`).
- On each new release, bump `manifest.json` `version`, re-run `build.py`, and upload
  the new zip; the stores push auto-updates to installed users.
