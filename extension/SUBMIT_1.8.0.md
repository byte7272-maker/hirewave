# Chrome Web Store — v1.8.0 submit notes (delta over 1.7.1)

**Context:** 1.8.0 is a **follow-up update**. Start from **`SUBMIT_1.7.0.md`** (all listing copy,
permission justifications, host box, data-collection checkboxes, privacy URL) — those are
unchanged **except the Single purpose**, replaced below. Only the items here differ.

**Sequencing:** the Chrome Web Store allows one pending version per item. Make sure 1.7.1 is
accepted/published before uploading 1.8.0. Upload package:
`extension/dist/project-harbor-connect-1.8.0.zip` (build with `python extension/build.py`;
confirm manifest version **1.8.0**).

**Rule (unchanged):** no provider named in any free-text field.

---

## What changed since 1.7.1
1.8.0 is a **security hardening of the Web-research feature only — strictly more restrictive,
with NO new permissions.** Research now fetches **only safe public pages**:
- **HTTPS only**, on the default port — no `http://`, no other scheme, no odd ports.
- **No IP-literal hosts** — any raw IPv4/IPv6 address (public *or* private) is refused (SSRF
  protection); only real domain names.
- **No adult / torrent / piracy** destinations — blocked by host label *and* by search term
  (the search is refused before it runs).
- **No file downloads** — URLs ending in an executable/archive/document extension
  (exe, msi, apk, dmg, zip, torrent, pdf, doc(x), xls(x), ppt(x), iso, …) are never fetched;
  research reads **readable page text only**.
- Fetches **omit credentials** (never the user's logged-in/private view), **run no page
  scripts**, and the returned text is capped — the page text is treated as data.

**Reviewer-relevant framing:** every change in 1.8.0 *removes* capability (tighter URL/query
gating on the existing Web-research flow). No permission is added or broadened; `tabs`,
`scripting`, `storage`, `cookies`, and host access are used exactly as in 1.7.x.

## Where the delta goes (same as 1.7.1 — there is no public "What's new" field)
1. **Permission justifications (Privacy practices tab):** **no edits needed.** No permission
   changed; the Web-research behavior is only *narrower*. The "What changed" bullets above are
   your ready answer if a reviewer asks why the research flow is safe.
2. **"Notes for the reviewer" box (only in some submit flows):** if it appears, paste the note
   below; if it doesn't, skip it — nothing else is required.

**Must-do fields for 1.8.0 are only:** upload the 1.8.0 zip + overwrite the **Single purpose**
text (below). Everything else carries over from 1.7.x.

### Paste-ready reviewer note (use only if a notes box appears)
```
Since 1.7.1: Web research is hardened and strictly narrower, with no new permissions. The extension now fetches research pages only over HTTPS on the default port, refuses any IP-address host (public or private), refuses adult/torrent/piracy hosts and search terms, and never fetches file downloads (executables, archives, documents, torrents) — it reads readable page text only, with credentials omitted and no page scripts run. All other behavior and permissions are unchanged from 1.7.1.
```

## Field to OVERWRITE — Single purpose (replaces the 1.7.1 version)
**Chrome limits this field to 1000 characters. The text below is 976 — paste it verbatim.**
```
Project Harbor Connect is the companion to the user's Project Harbor account. Only on the user's action, it: (1) connects a job site the user is signed into, using only its existing cookies; (2) pulls listings the user views into their account; (3) fills missing pay, benefits, and location from the public posting viewed (or saved postings it opens in background tabs); (4) with Web research on and a search approved, looks up an employer on the open web and sends the public page text to the account to summarize; (5) places the user's résumé into a job site's upload field to review; and (6) fills an application form with the user's saved details. Web research reads only public HTTPS pages (no IP address, login, adult/torrent/piracy site, or file download), text only. It never reads passwords and never submits an application; the user reviews and submits. The only control it clicks is a site's Save on a résumé update, only if opted in; never an application's Submit.
```

## Unchanged from 1.7.x (do NOT re-edit)
- Summary (129-char listing summary), Detailed description, and the `tabs` / `scripting` /
  `storage` / `cookies` / host-permission justifications.
- Data-collection checkboxes (Authentication information, Website content, Personally
  identifiable information) + the three certifications; Remote code = **No**.
- Privacy-policy URL (`…/static/privacy.html`). The new safety gating only *restricts* what
  research reads (public HTTPS pages, text only), consistent with the existing disclosure —
  no privacy-policy change is required. (Optional, reviewer-favorable: add one line noting
  research never fetches IP addresses, adult/torrent/piracy sites, or file downloads.)

## Before Submit
- Build and upload `project-harbor-connect-1.8.0.zip`; confirm the dashboard shows **1.8.0**.
- Overwrite the **Single purpose** field with the 976-char text above (these two are the only
  required changes — there is no "What's new" field).
- If a "Notes for the reviewer" box appears, paste the reviewer note above; otherwise skip it.
- Confirm no provider names in any free-text field.
