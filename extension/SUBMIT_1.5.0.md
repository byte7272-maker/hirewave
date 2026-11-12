# Chrome Web Store — v1.5.0 submit notes (what changed from 1.4.1)

**What's new in 1.5.0:** optional **Web research** — the assistant can research an employer
(leadership, news, keywords) on the open web **using this browser**, only after the user
turns it on and approves each search. This adds a **new OPTIONAL broad host permission**
(`*://*/*`, requested on demand, not in the default install) and a **new data flow** (the
readable text of approved public pages is sent to the user's Project Harbor account to
summarize). Because permissions expanded, **expect a fresh review** — overwrite the fields
below, don't just re-upload.

**Rule (unchanged):** no provider is named in any free-text field. Ctrl+F every field for
LinkedIn / Indeed / Glassdoor / Greenhouse / Workday / ZipRecruiter / Dice → zero matches.

Upload package: `extension/dist/project-harbor-connect-1.5.0.zip` (manifest version 1.5.0).

---

## Fields to OVERWRITE

### Summary (≤132 chars)
```
Connect a job board, pull jobs you view, research employers, fill applications with your details — you submit, never a password.
```

### Description — add this bullet to the "three ways" list (make it four)
```
- Research an employer on the open web, only when you turn on Web research and approve a search: it looks up the company using your browser, reads public pages, and summarizes useful facts, leadership, and keywords to help you tailor your application. Public pages only — never your logged-in or private data.
```

### Single purpose — replace with
```
Project Harbor Connect is the companion extension for the user's own Project Harbor account. On the user's action it (1) connects a job site the user is logged into by reading only that site's existing session cookies, (2) pulls job listings the user is viewing into their account, (3) fills an application form the user opens with the user's own saved details, and (4) when the user turns on Web research and approves a specific search, looks up an employer on the open web using the user's browser and sends the readable text of the public pages found to the user's account to summarize into job-search notes. It never reads passwords, never submits a form, and — for research — reads only public pages (requests made without the user's cookies), never logged-in or private data. Every function serves the single purpose of helping the user apply for jobs through their own Project Harbor account; data is transmitted only to that account over HTTPS.
```

## Fields to UPDATE

> **How the Privacy practices tab is laid out (read this first):**
> - **Single purpose** — one free-text box.
> - **Permission justifications** — one free-text box PER permission. There is a **single
>   "Host permission justification" box that covers ALL host permissions** — the required
>   job-site hosts AND the optional `*://*/*`. Chrome does NOT give optional host
>   permissions their own field, so the two go in the same box (see below).
> - **Data collection** — a list of **CHECKBOXES** (Authentication information, Website
>   content, …) plus three certification checkboxes. **You do NOT type anything here** —
>   you only tick boxes. The *description* of what the data is lives in the privacy policy
>   and the Single purpose box, not here.

### Host permission justification — ONE box covers required + optional hosts (1000-char cap)
This field caps at **1000 characters** and the 1.4.1 text is already near the limit, so the
optional-permission note must be folded in, not appended. **Replace the whole field** with
this combined version (909 chars — covers job sites, API/app origin, and the optional research
permission as item 3; there is no separate field for the optional host):
```
Two kinds of hosts, plus one optional. (1) Job-site hosts in host_permissions: only on the user's action, to read that site's session cookies when the user connects it, and to read an application form's field labels and fill the user's own details when the user clicks fill. No other page content; never passwords. (2) The Project Harbor API host and app origin: the API host receives sessions and form-field labels over HTTPS to map to the user's own account; the app origin lets a content script mark the extension installed and relay the user's requests. (3) An OPTIONAL broad host permission (*://*/*), NOT in the default install, requested only if the user turns on Web research: used only to fetch public pages the user approves, without the user's cookies (readable text only, never executed), sent to the user's own account over HTTPS to summarize. Each host is necessary; no other sites are accessed.
```

### Data collection — CHECKBOXES only (nothing to type)
- ☑ **Authentication information** (connected site's session cookies; no passwords) — keep checked.
- ☑ **Website content** — keep/leave checked. It now also covers the readable text of public
  pages fetched during research. **This is only a checkbox** — there is no text field here.
- Certification checkboxes (attest all three):
  - Is data sold to third parties? → **No**
  - Used/transferred for purposes unrelated to the single purpose? → **No**
  - Used to determine creditworthiness / lending? → **No**
- Are you using remote code? → **No** (research fetches page *text* as data; it is never executed)

### Privacy policy URL
`https://hirewave-production-3db3.up.railway.app/static/privacy.html`
— **updated** to disclose the optional Web research data flow (deploys with the backend;
verify it loads and mentions "Web research" before submitting).

---

## UNCHANGED from 1.4.1 (leave as-is)
- `cookies`, `tabs`, `scripting`, `storage` justifications — research adds no new use of these
  (it fetches from the background worker under the optional host permission; it does not use
  `scripting` and stores nothing new).
- Category (Productivity), language, icon, screenshots, homepage/support URLs.

## Before Submit
- Upload `project-harbor-connect-1.5.0.zip`; confirm the dashboard shows version 1.5.0.
- Ctrl+F every free-text field for provider names → zero matches.
- Open the privacy policy URL and confirm it mentions Web research.
