# Chrome Web Store — v1.7.1 submit notes (delta over the already-submitted 1.7.0)

**Context:** v1.7.0 was already submitted. 1.7.1 is a **follow-up update** with everything
added after that submission. Start from **`SUBMIT_1.7.0.md`** (all listing copy, permission
justifications, host box, data-collection checkboxes, privacy URL) — those are unchanged
**except the Single purpose**, replaced below. Only the items here differ.

**Sequencing:** the Chrome Web Store allows one pending version per item. If 1.7.0 is still
in review, let it finish (publish or reject) **before** uploading 1.7.1. Upload package:
`extension/dist/project-harbor-connect-1.7.1.zip` (manifest version 1.7.1).

**Rule (unchanged):** no provider named in any free-text field.

---

## What changed since 1.7.0
1. **Résumé sync never changes your visibility** — a privacy reminder now travels with every
   sync (toast + steps): updating the file does not make your résumé public or searchable; it
   stays as you set it on the site.
2. **Easier Save, with an opt-in to automate it** — after the résumé attaches:
   - a one-click **"Save on this site"** button clicks the site's own Save for the user
     (user-initiated each time), and
   - an **opt-in setting** (off by default, in the extension popup) lets the extension click
     Save automatically after a **short, cancellable countdown**.
   This is **scoped to résumé updates only**. Job applications stay fully manual — the
   extension never clicks an application's Submit.

**Reviewer-relevant behavior change:** the extension can now **click a site's "Save" control**,
but only (a) on a résumé-profile update, (b) that the user triggered, and (c) automatically
only if the user turned the option on, with a cancel window. It never clicks an application's
Submit, and no new permissions were added (uses the existing `scripting` + host access).

## Field to OVERWRITE — Single purpose (replaces the 1.7.0 version)
```
Project Harbor Connect is the companion extension for the user's own Project Harbor account. On the user's action it (1) connects a job site the user is logged into by reading only that site's existing session cookies; (2) pulls job listings the user is viewing into their account; (3) fills in missing pay, benefits, and location on the user's saved matches by reading the public job posting the user is viewing — or the user's own saved job postings it opens in background tabs — and sending that page text to the user's account to parse; (4) when the user turns on Web research and approves a specific search, looks up an employer on the open web using the user's browser and sends the readable text of the public pages found to the user's account to summarize; (5) when the user clicks to update their résumé, places the user's own résumé file (downloaded from the user's account) into the job site's résumé upload field for the user to review — by default the user clicks the site's Save, or the user may opt in (off by default) to let the extension click the site's Save on a résumé update, with a cancellable countdown; and (6) fills an application form the user opens with the user's own saved details. It never reads passwords, never submits a job application on the user's behalf (the user reviews and submits), and — for research — reads only public pages without the user's cookies. The only control the extension ever clicks is a site's Save on a résumé update, and only if the user opted in; it never clicks an application's Submit. Every function serves the single purpose of helping the user apply for jobs through their own Project Harbor account; data is transmitted only to that account over HTTPS.
```

## Unchanged from 1.7.0 (do NOT re-edit)
- Summary (129-char manifest description / listing summary), Detailed description, the
  `tabs` / `scripting` / `storage` / `cookies` / host-permission justifications.
- Data-collection checkboxes (Authentication information, Website content, Personally
  identifiable information) + the three certifications; Remote code = No.
- Privacy-policy URL (`…/static/privacy.html`) — already updated and verified live; it
  discloses the opt-in Save-on-résumé-update and that visibility never changes.

## Before Submit
- Upload `project-harbor-connect-1.7.1.zip`; confirm the dashboard shows **1.7.1**.
- Confirm no provider names in any free-text field.
- Confirm the privacy-policy URL mentions the opt-in Save and "visibility … stays as you set it".
