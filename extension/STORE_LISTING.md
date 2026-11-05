# Project Harbor Connect — Store Submission Kit

Copy-paste content for the Chrome Web Store and Microsoft Edge Add-ons listing +
review forms. Both stores ask for the same substance (listing copy, a single-
purpose statement, per-permission justifications, and data-use disclosures).

---

## Listing basics

- **Name:** Project Harbor Connect
- **Summary (<=132 chars):** Connect a job board you use, pull the jobs you view, and fill applications with your saved details — you approve and submit. _(130 chars)_
- **Category:** Productivity
- **Language:** English
- **Homepage / support URL:** https://hlrtlg.readdy.co
- **Privacy policy URL:** _host `privacy.html` at a public URL and paste it here_ (required -- this extension uses the `cookies` permission)

## Detailed description

_(Rejected v1.1.0 AND v1.1.1 for "excessive keywords" -- a free-text field still
listed every supported site by name. Fix: NO provider is named in ANY free-text
listing field (description, single-purpose, or permission justifications). The
provider domains appear ONLY in the manifest's `host_permissions` declaration,
which reviewers expect and which does not count as description keywords. This copy
frames the extension as a helper that works alongside the job boards you already
use, not an alternative to them.)_

> Project Harbor Connect is the companion browser extension for Project Harbor, your
> AI application assistant.
>
> Keep the job boards you already use. The extension helps in three ways — always on
> your action, always with you in control:
> - Connect a site you're signed in to: it reads only that site's existing session
>   (its cookies) and hands it to your Project Harbor account over a secure connection.
> - Pull the jobs you're viewing into Project Harbor, so the assistant can match and
>   tailor your resume to them.
> - Fill an application form with your own saved details when you click "Fill with
>   Harbor": it reads the form's field labels, fills your information, and highlights it
>   for you to review. It never fills passwords or eligibility questions, and it never
>   submits — you do.
>
> You stay logged in on each site's own page; the extension never sees, stores, or
> transmits your password. It works alongside the sites you already use -- it is not a
> replacement for them, and every listing and its content belong to that site.
>
> Why install it:
> - A helper, not autopilot: you approve every application and click Submit yourself.
> - Private by design: your session and your own details only, never your password; it
>   acts only when you ask, and you can disconnect any site at any time.
>
> You'll need a Project Harbor account to use this extension.

## How it works

1. In Project Harbor, open **Connect a site** and choose a job site (or paste your
   Project Harbor token in the extension popup's Advanced section to enable pull/fill).
2. Make sure you're logged into that site in this browser.
3. **Connect:** the extension attaches your existing session automatically — no code to
   copy.
4. **Pull:** on a board's job list, open the popup and pull the jobs you're viewing.
5. **Fill:** on an application page, click the **Fill with Harbor** button — it fills your
   saved details and highlights them; you review and submit.

## Single-purpose statement (required)

_(Paste verbatim into the dashboard's "Single purpose description" field.)_

> Project Harbor Connect is the companion extension for the user's own Project Harbor
> account. On the user's action it (1) connects a job site the user is logged into by
> reading only that site's existing session cookies, (2) pulls job listings the user is
> viewing into their Project Harbor account, and (3) fills an application form the user
> opens with the user's own saved profile details. It reads an application form's field
> labels only on the user's click, never reads passwords, and never submits a form — the
> user reviews and submits. Every function serves the single purpose of helping the user
> apply for jobs through their own Project Harbor account; data is transmitted only to
> that account over HTTPS, and passwords are never read.

## Permission justifications (required -- one per permission)

_(Paste each into the matching dashboard field.)_

- **cookies** -- The extension reads the session cookies of the specific job site the
  user chooses to connect so the authenticated session can be sent to the user's own
  Project Harbor account. This is the core and only function; without the cookies
  permission the extension cannot capture the session and connect the site. Cookies
  are read only in direct response to the user's action, only for the single site they
  select, and are sent over HTTPS to the user's account. Passwords are never read.
- **tabs** -- The tabs permission is used only to read the active tab's URL to
  auto-detect which supported job site the user is currently on, so the correct site
  is pre-selected in the connect UI. No browsing history is collected, stored, or
  transmitted, and no other tab data is accessed. The URL is used ephemerally on the
  client for provider detection only.
- **scripting** -- The scripting permission lets the extension act on the page only in
  response to the user's action: (1) read the job listings on the page the user is viewing
  to pull them into the user's own account, and (2) read the labels and types of an
  application form the user chooses to fill and write the user's own saved details into it.
  It runs only on the job-site hosts declared in the manifest, reads no other page content,
  and never reads password fields.
- **storage** -- The storage permission persists local settings in the user's own browser
  (chrome.storage.local): the Project Harbor API base URL, and — if the user uses the
  pull-jobs or fill-form features — the Project Harbor token the user pastes, used to mint
  short-lived access tokens for their own account. Nothing is synced or shared; it saves
  the user from re-entering these.
- **host permission** -- Two kinds of hosts are requested. (1) The job-site hosts declared
  in the manifest's host_permissions — used, only on the user's action, to read that site's
  session cookies when the user connects it, and to read an application form's field labels
  and fill the user's own details when the user clicks to fill. The extension reads no other
  page content and never reads passwords. (2) The Project Harbor API host and app origin —
  the API host is where sessions and form-field labels are sent over HTTPS to map to the
  user's own account; the app origin is where a content script marks that the extension is
  installed and relays the user's requests. Each host is necessary; no other sites are
  accessed.

## Data-use disclosures (Chrome "Privacy practices" / Edge data collection)

Answer the store forms as follows:

- **What user data is collected?** (a) **Authentication information** — the session
  cookies of a job site the user explicitly connects (no passwords); and (b) **Website
  content** — the labels/types of an application form the user chooses to fill, and the job
  listings the user chooses to pull. Both are read only on the user's action and sent only
  to the user's own Project Harbor account over HTTPS.
- **Is data sold to third parties?** No.
- **Is data used or transferred for purposes unrelated to the item's single
  purpose?** No. Form-field labels are used solely to map the user's own saved details onto
  the form; they are not stored by the extension or shared.
- **Is data used to determine creditworthiness / for lending?** No.
- **Sensitive permissions justification:** see the `cookies`, `scripting`, and host
  justifications above.
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

## Published (Chrome Web Store)

> **v1.4.1 note:** this version adds the pull-jobs and **Fill with Harbor** behaviors, which
> read page content on the job-site hosts. That is a new data use, so on upload you MUST
> overwrite the **Single purpose**, the **host permission** justification, add a **scripting**
> justification, and update the **data-collection** answer to include *Website content* — then
> expect a fresh review. The provider-list rule still applies: zero provider names in any
> free-text field.

- **Item ID:** `apojagpcjhjfplfjfpcmlplhmokoandj`
- **Public URL:** https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj
  (canonical — omit any `?authuser=`/`?hl=` query params from links.)
- **Status:** published for **testers** — only Google accounts on the dashboard's
  Testers allowlist can install. Add each tester's email there.
- Wire this URL into the "Connect a site" / "Add to Chrome" install button
  (see `docs/READDY_CONNECT_EXTENSION.md`).
- On each new release, bump `manifest.json` `version`, re-run `build.py`, and upload
  the new zip; the store pushes auto-updates to installed users.
