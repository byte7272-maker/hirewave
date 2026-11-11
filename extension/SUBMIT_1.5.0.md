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

## Fields to ADD

### Optional host permission `*://*/*` justification  ← NEW in 1.5.0 (the key one)
```
This broad host access is an OPTIONAL permission, not granted on install. It is requested only when the user explicitly turns on the Web research feature from the extension popup (a user gesture), and the user can turn it off at any time. It is used solely to fetch PUBLIC web pages the user approves when researching an employer — a web search and the resulting public pages (e.g. a company's About/leadership/news pages). Fetches are made WITHOUT the user's cookies (credentials omitted), so only publicly visible content is read; the extension never reads the user's logged-in, private, or authenticated pages, and never executes page scripts — it extracts readable text only and sends it to the user's own Project Harbor account over HTTPS to summarize. No broad access is used for any other purpose, and none is requested unless the user enables research.
```

## Fields to UPDATE

### Host permission justification (the existing job-site/API one) — append the research note
Keep the existing text, then add:
```
Separately, the extension also declares an OPTIONAL broad host permission that is NOT part of the default install; it is requested only if the user turns on Web research, and is used only to fetch public pages the user approves, without the user's cookies. See the optional-permission justification.
```

### Data collection — "What data do you collect?"
Keep **Authentication information** (connected site's session cookies; no passwords).
Update **Website content** to:
```
Website content — the labels/types of an application form the user chooses to fill, the job listings the user chooses to pull, AND (only if the user turns on Web research and approves a search) the readable text of the public web pages found for that search. All only on the user's action, sent only to the user's own Project Harbor account.
```
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
