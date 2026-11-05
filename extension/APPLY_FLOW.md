# Live-apply flow — extension fills the form in the user's own tab (no Playwright)

**Status:** spec for the next extension version. The shipped **v1.3.0** is *session-capture
only* (reads the job site's cookies on the app origin and posts a `storage_state` to the
server, which then replays it with Playwright). This spec adds the **live-apply** capability
so the Claude-backed AI fills the application form **in the user's own, already-authenticated
tab** — removing the need for server-side Playwright, stored cookies, proxies, and stealth.

> ⚠️ **This is a material change to the extension's data handling** (it begins reading and
> writing *page content* on job sites, where today it only reads *cookies* on an explicit
> connect). It requires a **new Chrome Web Store review**, an updated privacy policy, and new
> permission justifications. See "Store compliance" below. Keep the keyword-stuffing rules in
> `COMPLIANCE_NOTES.md` — provider names stay out of all free-text listing fields.

## The flow (human-in-the-loop — a person initiates every application)

1. The user opens a matched job's **application page** themselves (from the app's match /
   activity list, or directly). The app never navigates there automatically.
2. On a job-site page, the extension shows an unobtrusive **"Fill with Harbor"** affordance
   (popup action or an injected button). Nothing happens until the user clicks it.
3. On click, the content script reads the **visible form fields** (label, name, type,
   options, required) — *not* the whole page, never credentials — and sends them to the
   backend.
4. Backend **`POST /api/v1/apply/field-map`** returns a `{field → value}` plan built from the
   user's own profile/résumé (see contract). Credentials and legal/eligibility questions are
   never mapped.
5. The content script **fills the live inputs** from the plan and **highlights** each filled
   field (and lists `needs_user` / `skipped_sensitive` fields as "you fill this").
6. The user **reviews** and clicks the site's own **Submit** — or, for the auto-apply
   queue, the app's **approval checkpoint** (`/auto-apply/approvals/{id}/approve`) is the
   gate. The extension never clicks a final Submit without an explicit user action.
7. The content script reports the outcome back so it surfaces in the **activity feed**
   (`GET /api/v1/activity`) as a real, user-approved action.

## Manifest changes (from v1.3.0)

Add a content script for the supported job sites (the hosts are already in
`host_permissions`). Keep the existing app-origin content script as-is.

```jsonc
"content_scripts": [
  { "matches": ["https://hlrtlg.readdy.co/*", "https://hirewave-production-3db3.up.railway.app/*"],
    "js": ["content.js"], "run_at": "document_idle" },
  // NEW — the live-apply script, only on the declared job-site hosts:
  { "matches": [
      "https://*.greenhouse.io/*", "https://*.workday.com/*", "https://*.myworkday.com/*",
      "https://*.indeed.com/*", "https://*.ziprecruiter.com/*", "https://*.dice.com/*",
      "https://*.glassdoor.com/*"
      // NOTE: do NOT auto-fill-and-submit on linkedin.com — keep LinkedIn assisted/manual.
    ],
    "js": ["apply.js"], "run_at": "document_idle" }
]
```
Bump `version` to `1.4.1`. No new permission *strings* are required (`scripting`/`tabs`/
`storage` already declared), but the **justifications change** — see compliance.

## `apply.js` (new content script) — responsibilities

- **Idle by default.** Inject only the "Fill with Harbor" button; read/fill nothing until clicked.
- **Read fields** (on click): walk the focused `<form>` (or the visible form), collecting
  `{ name, label, type, options, required }` per input/select/textarea. Resolve the label from
  `<label for>`, `aria-label`, placeholder, or nearest preceding text. **Skip** `type=password`
  and `type=hidden`. Never read values the user already typed.
- **Call the backend** with the user's token (obtained via the existing app-origin message
  bridge / stored session), `POST /api/v1/apply/field-map` with `{ fields, job_id?, resume_id? }`.
- **Apply the plan**: for each `mapping`, set the matching input's value and dispatch
  `input` + `change` events (so the site's framework registers it); outline filled fields in
  the accent colour. Show a small summary: *N filled · K you-fill · M sensitive skipped*.
- **Never submit.** Leave Submit to the user (or the app's approval checkpoint).
- **Report** `{ job_id, filled: N, provider }` back to the app so the activity feed shows it.

## Backend contract (LIVE)

`POST /api/v1/apply/field-map`  (Bearer auth — the user's own token)

Request:
```json
{ "job_id": "job_...", "resume_id": "res_...",
  "fields": [ { "name": "email", "label": "Email", "type": "email", "options": [], "required": true } ] }
```
Response:
```json
{ "mappings": [ { "field": "email", "value": "you@example.com", "source": "profile", "confidence": 0.95 } ],
  "unmapped": ["Favorite mascot"],
  "skipped_sensitive": ["Password"],
  "needs_user": ["Are you authorized to work in the US?"],
  "note": "Review before submitting. Credentials and legal/eligibility questions are never auto-filled." }
```
Guarantees the UI can rely on: **credentials/financial/government-id fields are never in
`mappings`** (they're in `skipped_sensitive`); **legal attestations** (work authorization,
sponsorship, veteran/disability, consent/“I certify”) are never auto-answered (they're in
`needs_user`); common fields map deterministically with no LLM cost, and Claude only fills the
long tail (re-screened through the same guard). The endpoint performs **no** page action.

## Guardrails (the security/control story)

- **Only the form the user opened.** `apply.js` acts on one form, on user click — never scrapes
  the page or acts across tabs.
- **Page content is untrusted.** A malicious job page could try to steer the AI; the backend maps
  only to the user's own data and never executes page instructions.
- **No credentials, ever.** Password/hidden fields are skipped client-side *and* server-side.
- **Legal attestations stay with the user.** The app never attests work authorization, etc.
- **LinkedIn stays manual-submit** (ToS) — do not include `linkedin.com` in `apply.js` matches.
- **Human-in-the-loop.** A person opens the job and clicks Fill; the final Submit is a human
  action or the app's explicit approval checkpoint.

## Store compliance (don't skip)

- Submitting a version that reads/writes page content on job sites is a **new data use** →
  expect a fresh review and a **privacy-policy update** disclosing: "reads the labels/types of
  the application form the user chooses to fill, and writes the user's own profile values into
  it; never reads passwords or page content beyond that form."
- Update the **permission justifications** (`scripting`, host permissions) to describe the
  fill-on-user-action behaviour. Keep every free-text field **free of provider-name lists**
  (`COMPLIANCE_NOTES.md`): justify hosts as "job-site application pages the user chooses to fill,
  declared in the manifest's host_permissions."
- You're already in **audience testing** with the 5 testers — ship 1.4.1 to them first, validate
  per provider, then promote to public.

## Build / rollout

1. Add `apply.js`, bump manifest to `1.4.1`, run `build.py` → `dist/project-harbor-connect-1.4.1.zip`.
2. Update `STORE_LISTING.md` privacy + justifications (no provider lists).
3. Upload to the Web Store, keep it on the tester audience, validate field-fill per provider
   (submit held), then publish.
