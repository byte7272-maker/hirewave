# Chrome Web Store — v1.7.1 submit notes (delta over the already-submitted 1.7.0)

**Context:** v1.7.0 was already submitted. 1.7.1 is a **follow-up update** with everything
added after that submission. Start from **`SUBMIT_1.7.0.md`** (all listing copy, permission
justifications, host box, data-collection checkboxes, privacy URL) — those are unchanged
**except the Single purpose**, replaced below. Only the items here differ.

**Sequencing:** the Chrome Web Store allows one pending version per item. **1.7.0 was accepted
and published**, so that gate is clear — 1.7.1 can be uploaded now. Upload package:
`extension/dist/project-harbor-connect-1.7.1.zip` (manifest version 1.7.1, description 129 chars).

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

## Where the "what's new" delta goes (read this — it's not what you'd expect)
The Chrome Web Store has **no public "What's new" / changelog field** (unlike mobile app
stores). So there is **nothing public to fill in** for this update. The "delta over 1.7.0"
matters in two places, and you may only see one:

1. **Permission-justification fields (Privacy practices tab) — always there.** These justify
   each permission; a reviewer reads them to confirm every permission serves the single
   purpose. The one *behavior* change in 1.7.1 is that the extension can now click a page
   control (the site's Save) via the **existing** `scripting` permission. That's already
   disclosed in the **Single purpose** text above ("The only control it clicks is a site's
   Save … never an application's Submit") and in the **privacy policy** — so **no justification
   needs editing**. The bullets under "What changed" are just your ready answer if a reviewer
   asks why the new click is compliant.
2. **A "Notes for the reviewer" / test-instructions box — only in *some* submit flows.** If it
   appears when you click Submit, paste the short note below. If it doesn't appear, skip it —
   there is nowhere else a changelog belongs, and none is required.

**Must-do fields for 1.7.1 are only:** upload the zip + overwrite the **Single purpose** text.
Everything else carries over from 1.7.0. The reviewer note is a safety net, not a requirement.

### Paste-ready reviewer note (use only if a notes box appears)
```
Since 1.7.0: résumé updates now show a privacy reminder (updating the file never changes your résumé's visibility on the site). Save is easier — a one-click "Save on this site" button the user clicks, plus an opt-in setting (off by default) that lets the extension click the site's Save after a cancellable countdown. This is scoped to résumé updates only; the extension never clicks an application's Submit. No new permissions were added — it uses the existing scripting + host access.
```

## Field to OVERWRITE — Single purpose (replaces the 1.7.0 version)
**Chrome limits this field to 1000 characters.** The text below is 997 — paste it verbatim.
```
Project Harbor Connect is the companion to the user's Project Harbor account. Only on the user's action, it: (1) connects a job site the user is signed into, using only its existing cookies; (2) pulls listings the user views into their account; (3) fills missing pay, benefits, and location from the public posting viewed (or saved postings it opens in background tabs), sending that text to the account to parse; (4) with Web research on and a search approved, looks up an employer on the open web and sends the public page text to the account to summarize; (5) places the user's résumé into a job site's upload field to review; and (6) fills an application form with the user's saved details. It never reads passwords and never submits an application—the user reviews and submits. The only control it clicks is a site's Save on a résumé update, only if opted in; never an application's Submit. Data goes only to that account over HTTPS, for the single purpose of helping the user apply for jobs.
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
- Overwrite the **Single purpose** field with the 997-char text above (these two are the only
  required changes — don't go looking for a "What's new" field; there isn't one).
- If a "Notes for the reviewer" box appears, paste the reviewer note above; otherwise skip it.
- Confirm no provider names in any free-text field.
- Confirm the privacy-policy URL mentions the opt-in Save and "visibility … stays as you set it".
