# Chrome Web Store — field-by-field submit checklist (Project Harbor Connect)

Work top to bottom through the dashboard. **Rule:** no provider is named in any
free-text field. Provider domains live ONLY in the manifest's `host_permissions`
(already in the zip). Rejected twice (v1.1.0, v1.1.1) for a provider list in a
free-text field — overwrite every field below, don't just re-upload.

Upload package: `extension/dist/project-harbor-connect-1.4.1.zip`

**v1.4.1 adds page access on job sites** (pull jobs + "Fill with Harbor"). That's a new
data use: you MUST overwrite the Single purpose, the host-permission justification, ADD a
`scripting` justification, and update the data-collection answer to include *Website
content*. Expect a fresh review.

---

## Package

- [ ] **Upload new package** → `project-harbor-connect-1.4.1.zip` (manifest version 1.4.1).

## Store listing tab

- [ ] **Item name / Title:**
  `Project Harbor Connect`

- [ ] **Summary** (short description, ≤132 chars):
  `Connect a job board you use, pull the jobs you view, and fill applications with your saved details — you approve and submit.`

- [ ] **Description** (detailed):
  ```
  Project Harbor Connect is the companion browser extension for Project Harbor, your AI application assistant.

  Keep the job boards you already use. The extension helps in three ways — always on your action, always with you in control:
  - Connect a site you're signed in to: it reads only that site's existing session (its cookies) and hands it to your Project Harbor account over a secure connection.
  - Pull the jobs you're viewing into Project Harbor, so the assistant can match and tailor your resume to them.
  - Fill an application form with your own saved details when you click "Fill with Harbor": it reads the form's field labels, fills your information, and highlights it for you to review. It never fills passwords or eligibility questions, and it never submits — you do.

  You stay logged in on each site's own page; the extension never sees, stores, or transmits your password. It works alongside the sites you already use -- it is not a replacement for them, and every listing and its content belong to that site.

  Why install it:
  - A helper, not autopilot: you approve every application and click Submit yourself.
  - Private by design: your session and your own details only, never your password; it acts only when you ask, and you can disconnect any site at any time.

  You'll need a Project Harbor account to use this extension.
  ```

- [ ] **Category:** Productivity
- [ ] **Language:** English (United States)
- [ ] **Store icon (128×128):** `extension/icons/icon128.png`
- [ ] **Screenshot (1280×800, ≥1 required):** `extension/store-assets/screenshot-1280x800.png`
- [ ] **Small promo tile (440×280, optional):** `extension/store-assets/promo-440x280.png`
- [ ] **Marquee promo tile (1400×560, optional):** `extension/store-assets/marquee-1400x560.png`
- [ ] **Official URL / Homepage:** `https://hlrtlg.readdy.co`
- [ ] **Support URL:** `https://hlrtlg.readdy.co`

## Privacy practices tab

- [ ] **Single purpose:**
  ```
  Project Harbor Connect is the companion extension for the user's own Project Harbor account. On the user's action it (1) connects a job site the user is logged into by reading only that site's existing session cookies, (2) pulls job listings the user is viewing into their Project Harbor account, and (3) fills an application form the user opens with the user's own saved profile details. It reads an application form's field labels only on the user's click, never reads passwords, and never submits a form - the user reviews and submits. Every function serves the single purpose of helping the user apply for jobs through their own Project Harbor account; data is transmitted only to that account over HTTPS, and passwords are never read.
  ```

- [ ] **`cookies` justification:**
  ```
  The extension reads the session cookies of the specific job site the user chooses to connect so the authenticated session can be sent to the user's own Project Harbor account. This is the core and only function; without the cookies permission the extension cannot capture the session and connect the site. Cookies are read only in direct response to the user's action, only for the single site they select, and are sent over HTTPS to the user's account. Passwords are never read.
  ```

- [ ] **`tabs` justification:**
  ```
  The tabs permission is used only to read the active tab's URL to auto-detect which supported job site the user is currently on, so the correct site is pre-selected in the connect UI. No browsing history is collected, stored, or transmitted, and no other tab data is accessed. The URL is used ephemerally on the client for provider detection only.
  ```

- [ ] **`scripting` justification** ← *NEW in 1.4.1*:
  ```
  The scripting permission lets the extension act on the page only in response to the user's action: (1) read the job listings on the page the user is viewing to pull them into the user's own account, and (2) read the labels and types of an application form the user chooses to fill and write the user's own saved details into it. It runs only on the job-site hosts declared in the manifest, reads no other page content, and never reads password fields.
  ```

- [ ] **`storage` justification:**
  ```
  The storage permission persists local settings in the user's own browser (chrome.storage.local): the Project Harbor API base URL, and - if the user enables the pull-jobs or fill-form features - the user's own Project Harbor session token, which the Project Harbor app hands to the extension when the user clicks Enable (or the user pastes as a fallback). It is used only to mint short-lived access tokens for the user's own account. Nothing is synced or shared.
  ```

- [ ] **Host permission justification** ← *this field held the rejected list; overwrite it*:
  ```
  Two kinds of hosts are requested. (1) The job-site hosts declared in the manifest's host_permissions - used, only on the user's action, to read that site's session cookies when the user connects it, and to read an application form's field labels and fill the user's own details when the user clicks to fill. The extension reads no other page content and never reads passwords. (2) The Project Harbor API host and app origin - the API host is where sessions and form-field labels are sent over HTTPS to map to the user's own account; the app origin is where a content script marks that the extension is installed and relays the user's requests. Each host is necessary; no other sites are accessed.
  ```

- [ ] **Are you using remote code?** → **No**
- [ ] **Data collection — What data do you collect?** → **Authentication information**
      (the session cookies of a job site the user connects; no passwords) **+ Website
      content** (the labels/types of an application form the user chooses to fill, and the
      job listings the user chooses to pull) — both only on the user's action, sent only to
      the user's own account.
- [ ] **Is data sold to third parties?** → **No**
- [ ] **Used/transferred for purposes unrelated to the single purpose?** → **No**
- [ ] **Used to determine creditworthiness / lending?** → **No**
- [ ] **Certify** the disclosures are accurate + comply with the Limited Use policy.
- [ ] **Privacy policy URL:** `https://hirewave-production-3db3.up.railway.app/static/privacy.html`
      (live — verified 200; reflects the v1.4.1 pull + fill + one-click-enable flow).

## Before you hit Submit

- [ ] Ctrl+F the **Description** and every **justification** field for: LinkedIn,
      Indeed, Glassdoor, Greenhouse, Workday, ZipRecruiter, Dice → there should be
      **zero** matches in free text. (They belong only in the manifest, which the
      reviewer reads from the package.)
