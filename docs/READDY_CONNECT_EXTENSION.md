# Readdy: "Connect a site" screen — extension install + pairing flow

How the frontend should get a **new visitor** from "I want the assistant to apply
for me" to a connected job site. The extension is the delivery mechanism; this
screen installs it and drives the pairing-code handshake.

## The three states

Render the Connect flow (per site, e.g. from the **Authenticated Apps** panel) as a
short wizard with these states:

### 1. Install the extension (default for new visitors)

Most new users won't have the extension. Lead with installing it — don't assume
it's present.

- **Detect the browser.** If Chrome/Chromium/Brave → show the **Chrome Web Store**
  button. If Edge → show the **Edge Add-ons** button. (Edge can also install from the
  Chrome store, but prefer the Edge listing.) For any other browser (Safari,
  Firefox, mobile) → skip to the **local-helper fallback** (state 3): the extension
  is Chromium-only.
- Buttons link to the published store pages:
  - Chrome Web Store: `<CHROME_STORE_URL>` _(fill in after publishing)_
  - Edge Add-ons: `<EDGE_STORE_URL>` _(fill in after publishing)_
- Copy: "Install **Hirewave Connect** to link a job site. It captures your login
  **session only — never your password** — so the assistant can apply for you."
- Show a secondary link: **"Already installed?"** → advances to state 2.

### 2. Pair (extension installed)

1. **Mint a pairing code** — `POST /api/v1/auto-apply/sessions/connect-intent`
   with `{ provider }` (send the Hirewave auth token). Response includes `code` and
   `expires_at` (~10 min). Display the code prominently with a **Copy** button and a
   countdown to `expires_at`.
2. Steps for the user:
   - "Make sure you're **logged into {provider}** in this browser."
   - "Click the **Hirewave Connect** icon in your toolbar."
   - "Paste this code and click **Connect this site**."
3. **Poll status** — `GET /api/v1/auto-apply/sessions/connect-intent/{code}`
   (owner-scoped) every ~2–3s. When it returns `status: "connected"`, show success
   and refresh the Authenticated Apps list. If `status: "expired"`, offer **"Get a
   new code"** (re-mint).
4. Never ask the user to paste cookies or tokens into Hirewave — the extension is
   the only thing that handles the session.

### 3. Local-helper fallback (non-Chromium browsers / power users)

For users who can't install the extension: point them at the CLI helper
(`python -m jobsearch.connect --provider {provider} --code {code}`, see
`docs/CONNECT_A_SITE.md`). Higher friction (needs Python + Playwright) — present it
as "Advanced / other browsers", not the primary path.

## Endpoints (already live)

| Purpose | Call |
|---|---|
| Mint pairing code | `POST /api/v1/auto-apply/sessions/connect-intent` `{ provider }` → `{ code, provider, status, expires_at }` |
| Poll status | `GET /api/v1/auto-apply/sessions/connect-intent/{code}` → `{ status, provider, session_id }` (`pending`/`connected`/`expired`) |
| Disconnect a site | `DELETE /api/v1/auto-apply/sessions/{provider}` → 204 |
| (Extension calls this, not the frontend) | `POST /api/v1/auto-apply/sessions/connect` `{ code, storage_state, label }` → `{ status, provider }` |

Route paths verified against the running auto-apply router.

## Detecting whether the extension is installed (built in)

The extension ships a content script that runs on the Hirewave app origin and
announces itself, so the frontend can **auto-skip the install step**:

- It sets `document.documentElement.dataset.hirewaveConnect = "<version>"`.
- It fires `window` event `hirewave-connect-ready` (detail `{ version }`) on inject.

Detect it robustly (the attribute may already be set, or arrive on the event):

```js
function extensionReady() {
  return !!document.documentElement.dataset.hirewaveConnect;
}
function onExtensionReady(cb) {
  if (extensionReady()) return cb();
  window.addEventListener("hirewave-connect-ready", () => cb(), { once: true });
  // fall back to the optimistic Install state if it never fires
}
```

If ready → go straight to **Pair** (state 2). If not → show **Install** (state 1)
with the "Already installed?" escape hatch (works even if detection is blocked).

> The content script matches `hlrtlg.readdy.co` and the Railway API host. If the
> Hirewave app moves to a **custom domain**, add that origin to `content_scripts.
> matches` (and `host_permissions` if the extension will POST there) and ship a new
> extension version.

## Copy guardrails

- Always state "**session/cookies only — never your password**". It's the core trust
  message and matches what the extension actually does.
- Make the pairing code's single-use + short expiry visible (a countdown), so an
  expired-code failure reads as expected, not broken.
