# Chrome Web Store — field-by-field submit checklist (Project Harbor Connect)

Work top to bottom through the dashboard. **Rule:** no provider is named in any
free-text field. Provider domains live ONLY in the manifest's `host_permissions`
(already in the zip). Rejected twice (v1.1.0, v1.1.1) for a provider list in a
free-text field — overwrite every field below, don't just re-upload.

Upload package: `extension/dist/project-harbor-connect-1.1.2.zip`

---

## Package

- [ ] **Upload new package** → `project-harbor-connect-1.1.2.zip` (manifest version 1.1.2).

## Store listing tab

- [ ] **Item name / Title:**
  `Project Harbor Connect`

- [ ] **Summary** (short description, ≤132 chars):
  `Connect a job board you already use so Project Harbor's assistant can help you apply. Session only, never your password.`

- [ ] **Description** (detailed):
  ```
  Project Harbor Connect is the companion browser extension for Project Harbor, your AI application assistant.

  Keep the job boards you already use. When you choose to connect a site you're signed in to, the extension reads only that site's existing session (its cookies) and hands it to your Project Harbor account over a secure connection, so the assistant can help you tailor your resume and apply -- with you approving every step. You stay logged in on the site's own page; the extension never sees, stores, or transmits your password.

  It works alongside the sites you already use -- it is not a replacement for them. You keep signing in to and using each site directly, and every listing and its content belong to that site.

  Why install it:
  - A helper, not autopilot: Project Harbor prepares applications; you approve every apply.
  - One connection: sign in on the site once, then connect it in a click.
  - Private by design: your session only, never your password; it acts only when you ask, and you can disconnect any site at any time.

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
  Project Harbor Connect connects a job site the user is already logged into to the user's own Project Harbor account, so Project Harbor's assistant can help the user apply for jobs and keep their resume updated on that site. When the user chooses to connect a site, the extension reads only that site's existing session cookies and sends them to the user's Project Harbor account over HTTPS. It never reads or transmits passwords - the user authenticates directly on the job site. Capturing an existing job-site session on request and handing it to the user's own Project Harbor account is the extension's only function.
  ```

- [ ] **`cookies` justification:**
  ```
  The extension reads the session cookies of the specific job site the user chooses to connect so the authenticated session can be sent to the user's own Project Harbor account. This is the core and only function; without the cookies permission the extension cannot capture the session and connect the site. Cookies are read only in direct response to the user's action, only for the single site they select, and are sent over HTTPS to the user's account. Passwords are never read.
  ```

- [ ] **`tabs` justification:**
  ```
  The tabs permission is used only to read the active tab's URL to auto-detect which supported job site the user is currently on, so the correct site is pre-selected in the connect UI. No browsing history is collected, stored, or transmitted, and no other tab data is accessed. The URL is used ephemerally on the client for provider detection only.
  ```

- [ ] **`storage` justification:**
  ```
  The storage permission persists one local setting - the Project Harbor API base URL the extension talks to (defaulting to the production API). It is stored only in the user's browser via chrome.storage.local, is never synced or transmitted, and contains no personal data. It exists so the user does not have to re-enter the endpoint.
  ```

- [ ] **Host permission justification** ← *this field held the rejected list; overwrite it*:
  ```
  Two kinds of hosts are requested. (1) The supported job-site domains declared in the manifest's host_permissions - required to read the session cookies of the specific site the user chooses to connect. (2) The Project Harbor API host and app origin - the API host is where the captured session is sent over HTTPS to the user's account; the app origin is where a content script sets a marker so the app knows the extension is installed and relays the user's connect request. Each host is necessary for the connect flow; no other sites are accessed.
  ```

- [ ] **Are you using remote code?** → **No**
- [ ] **Data collection — What data do you collect?** → **Authentication information**
      (the session cookies of the job site the user connects; no passwords)
- [ ] **Is data sold to third parties?** → **No**
- [ ] **Used/transferred for purposes unrelated to the single purpose?** → **No**
- [ ] **Used to determine creditworthiness / lending?** → **No**
- [ ] **Certify** the disclosures are accurate + comply with the Limited Use policy.
- [ ] **Privacy policy URL:** the public URL where `privacy.html` is hosted.

## Before you hit Submit

- [ ] Ctrl+F the **Description** and every **justification** field for: LinkedIn,
      Indeed, Glassdoor, Greenhouse, Workday, ZipRecruiter, Dice → there should be
      **zero** matches in free text. (They belong only in the manifest, which the
      reviewer reads from the package.)
