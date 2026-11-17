# Chrome Web Store — v1.7.0 submit notes (folds in 1.6.x + 1.7.0)

**Why this file:** v1.6.5 was **never independently submitted**, so v1.7.0 must disclose
**both** sets of changes on top of the last submitted listing (1.5.0 / Web research):

- **New since 1.5.0 (the 1.6.x line, "fill in pay & benefits"):** passive + on-demand
  **match enrichment**. When the user views a job on a site they use — or asks — the
  extension reads that **public job posting** and sends its text to the user's own account
  to fill in missing **pay, benefits, and location** on the user's saved matches. For the
  user's own saved jobs the server couldn't fetch, the extension opens **those saved job
  URLs in background tabs** to read the posting. This broadens the existing *Website content*
  use and the `tabs`/`scripting` use; **no new permission type**.
- **New in 1.7.0 ("keep your résumé current"):** **résumé sync**. On the user's click
  (**"Update résumé with Harbor"**) the extension downloads the user's **own résumé from
  their account** and places it into the job site's **résumé upload field** for the user to
  review and save; if the site won't accept a programmatic file, it **downloads** the résumé
  with step-by-step upload instructions. It **never saves or submits** — the user does. Also
  a popup **Setup** panel (Enable on your job sites / Link) — UI only, no new data use.

Because data use expanded again, **overwrite the fields below, don't just re-upload** —
expect a fresh review.

**Rule (unchanged):** no provider is named in any free-text field. Ctrl+F every field for
site names → zero matches. Provider domains live only in the manifest `host_permissions`.

**Upload package:** `extension/dist/project-harbor-connect-1.7.0.zip` (manifest version 1.7.0).

---

## Fields to OVERWRITE

### Summary (≤132 chars)
```
Connect a job board, pull jobs you view, fill in pay and benefits, research employers, keep your résumé current, fill applications.
```

### Detailed description — replace the "ways it helps" list with this (six ways)
```
Keep the job boards you already use. The extension helps — always on your action, always with you in control:
- Connect a site you're signed in to: it reads only that site's existing session (its cookies) and hands it to your Project Harbor account over a secure connection.
- Pull the jobs you're viewing into Project Harbor, so the assistant can match and tailor your résumé to them.
- Fill in missing pay, benefits, and location on your saved matches: when you view a job on a site you use — or when you ask — it reads that public posting and sends it to your account to complete the details the server couldn't see.
- Research an employer on the open web, only when you turn on Web research and approve a search: it reads public pages using your browser and summarizes useful facts. Public pages only — never your logged-in or private data.
- Keep your résumé current across the sites you use: when you click "Update résumé with Harbor," it puts your latest résumé from your account into that site's résumé upload for you to review and save — or, if the site won't take it directly, downloads it with step-by-step upload instructions. It never saves or submits — you do.
- Fill an application form with your own saved details when you click "Fill with Harbor": it reads the form's field labels, fills your information, and highlights it for review. It never fills passwords or eligibility questions, and it never submits — you do.

You stay logged in on each site's own page; the extension never sees, stores, or transmits your password. It works alongside the sites you already use — it is not a replacement for them. You'll need a Project Harbor account.
```

### Single purpose — replace with
```
Project Harbor Connect is the companion extension for the user's own Project Harbor account. On the user's action it (1) connects a job site the user is logged into by reading only that site's existing session cookies; (2) pulls job listings the user is viewing into their account; (3) fills in missing pay, benefits, and location on the user's saved matches by reading the public job posting the user is viewing — or the user's own saved job postings it opens in background tabs — and sending that page text to the user's account to parse; (4) when the user turns on Web research and approves a specific search, looks up an employer on the open web using the user's browser and sends the readable text of the public pages found to the user's account to summarize; (5) when the user clicks to update their résumé, places the user's own résumé file (downloaded from the user's account) into the job site's résumé upload field for the user to review and save; and (6) fills an application form the user opens with the user's own saved details. It never reads passwords, never saves or submits a form on the user's behalf, and — for research — reads only public pages without the user's cookies. Every function serves the single purpose of helping the user apply for jobs through their own Project Harbor account; data is transmitted only to that account over HTTPS.
```

## Fields to UPDATE

> **Privacy practices tab layout (reminder):** Single purpose = one box. Permission
> justifications = one box per permission, with a **single Host-permission box covering ALL
> hosts** (required + optional `*://*/*`). Data collection = **checkboxes only** (no free text).

### `tabs` justification — REPLACE (now also opens the user's own saved jobs)
```
The tabs permission is used (1) to read the active tab's URL to auto-detect which supported job site the user is on, so the correct site is pre-selected; and (2) only when the user pulls or enriches their matches, to open the user's OWN saved job postings in background tabs so the extension can read a posting the server couldn't fetch, then close them. No browsing history is collected, stored, or transmitted; only the user's own saved job URLs are opened, and only their job-posting text is read and sent to the user's own account.
```

### `scripting` justification — REPLACE (adds enrichment + résumé placement)
```
The scripting permission lets the extension act on the page only in response to the user's action: (1) read the job listings on the page the user is viewing to pull them into the user's account; (2) read the public job posting the user is viewing — or one of the user's own saved postings opened in a background tab — to fill in missing pay, benefits, and location on the user's matches; (3) read the field labels and types of an application form the user chooses to fill and write the user's own saved details into it; and (4) when the user clicks to update their résumé, read the site's résumé upload field and place the user's own résumé file into it for review. It runs only on the job-site hosts declared in the manifest, reads no other page content, never reads password fields, and never saves or submits.
```

### `storage` justification — REPLACE (minor: now also powers enrich/résumé)
```
The storage permission persists local settings in the user's own browser (chrome.storage.local): the Project Harbor API base URL and the user's own Project Harbor token, used to mint short-lived access tokens for the user's own account when the extension pulls jobs, enriches the user's matches, or updates the user's résumé on a site. Nothing is synced or shared; it saves the user from re-entering these.
```

### `cookies` justification — UNCHANGED (leave the 1.5.0/1.4.1 text as-is)

### Host permission justification — ONE box, all hosts (≤1000 chars). REPLACE whole field.
```
Job-site hosts (host_permissions), the account's API host and app origin, plus one OPTIONAL broad host. On the user's action, on the job sites: read the site's cookies when the user connects it; read the posting the user is viewing, or the user's own saved postings opened in background tabs, to fill missing pay/benefits; read an application form's labels and write the user's own details on a fill click; and read the résumé upload field and place the user's own résumé into it on an update click. No other page content; never passwords; never saves or submits. The API host receives sessions, page text and form labels over HTTPS; the app origin marks the extension installed and relays the user's requests. The OPTIONAL broad host (*://*/*), off by default, is requested only if the user enables Web research: used only to fetch public pages the user approves, without the user's cookies. No other sites are accessed.
```

### Data collection — CHECKBOXES only (nothing to type)
- ☑ **Authentication information** — a connected site's session cookies (no passwords). Keep checked.
- ☑ **Website content** — keep checked. Now also covers the text of **job postings** the user
  views or has saved (read to fill in pay/benefits) and the **résumé upload field** read to
  place the user's file. Still just a checkbox.
- ☑ **Personally identifiable information** — **CHECK THIS for 1.7.0.** The résumé-sync and
  "Fill with Harbor" features move the user's own résumé / saved details (name, contact,
  employment history) from the user's Project Harbor account into a form on the job site the
  user chose. It is the user's own data, delivered to the user's chosen site at the user's
  request — never sold, never sent to any third party beyond the user's account and the site
  the user is applying to. (If you prefer not to tick it, you must be ready to justify in
  review why placing a résumé into a site's upload field isn't PII handling — ticking it is
  the honest, lower-risk choice.)
- Certification checkboxes (attest all three):
  - Is data sold to third parties? → **No**
  - Used/transferred for purposes unrelated to the single purpose? → **No**
  - Used to determine creditworthiness / lending? → **No**
- Are you using remote code? → **No** (enrichment sends page *text* as data; résumé sync moves
  a *file*; nothing is executed).

### Privacy policy URL
`https://hirewave-production-3db3.up.railway.app/static/privacy.html`
— must disclose **both** new flows: (a) reading job postings the user views/saved to fill in
pay & benefits, and (b) placing the user's own résumé into a job site's upload field. Verify
it loads and mentions résumé sync + match enrichment **before** submitting.

---

## UNCHANGED from 1.5.0 (leave as-is)
- `cookies` justification; Web research description/flow (still accurate — item 4).
- Category (Productivity), language, icon, homepage/support URLs.
- Screenshots — **refresh if you want** to show "Update résumé with Harbor"; not required.

## Before Submit
- `python extension/build.py` → upload `project-harbor-connect-1.7.0.zip`; confirm the
  dashboard shows version **1.7.0**. (The build now fails if the manifest references a JS file
  the zip omits — e.g. `apply_sync.js` / `passive_enrich.js`.)
- Ctrl+F every free-text field for provider names → zero matches.
- Open the privacy-policy URL; confirm it mentions **match enrichment** and **résumé sync**.
- Tick **Personally identifiable information** in data collection (see above).
