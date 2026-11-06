# Backend task — One-click "Open in Google Docs" (Google Drive integration)

**Goal:** turn P91's "download `.docx` → import into Google Docs" into a true **one-click "Open in Google Docs"**: with the user's Drive permission, upload the current résumé/cover-letter version to their Drive, convert it to a native **Google Doc**, and return its URL so the frontend opens it in a new tab for further editing.

**Status:** OAuth plumbing is **already in place**. This task adds the Drive upload client, one action endpoint, the connect wiring, and tests. **Frontend (P91) needs no change beyond swapping its Google Docs menu item to call the new endpoint when Drive is connected.**

---

## What already exists (reuse — do NOT rebuild)

- **Provider + OAuth config.** `Provider.GOOGLE_DRIVE = "google_drive"` (`models/integration.py`) and a complete `ProviderConfig` in `engines/integration/providers.py`:
  - authorize `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, revoke `https://oauth2.googleapis.com/revoke`
  - **least-privilege** `default_scopes = ("openid", "https://www.googleapis.com/auth/drive.file")` — `drive.file` grants access **only to files this app creates**, never the user's whole Drive. Keep it.
  - `use_pkce=True`, `extra_authorize_params={"access_type":"offline","prompt":"consent"}` (so we get a refresh token).
- **Shared Google credentials.** `config.py` `provider_credentials` maps `"google_drive" → "GOOGLE"`, so `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` already cover Drive (same client as Gmail / Sign-in-with-Google). No new app registration — just add the Drive scope to the OAuth consent screen and whitelist the redirect.
- **IntegrationEngine** (`engines/integration/engine.py`): `authorize_url(...)`, code→token exchange, **encrypted-at-rest** `OAuthToken` storage, and `_refresh(...)`. Works for any provider in the registry.
- **Connect endpoints** (`api/routers/integrations.py`): the generic OAuth connect/callback already drives any registry provider.
- **Document → .docx renderer** (`api/routers/documents.py`): `export_resume_docx` / `export_cover_letter_docx` already produce a formatted `.docx` of the **active version** (verified live: 200, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`). Reuse this exact bytes-producing path — do not re-render separately.

---

## New work

### 1. Confirm `google_drive` is connectable through the existing flow
- Ensure the connect endpoint accepts `provider=google_drive` and that `GET /api/v1/integrations/connected-apps` lists Drive with a `connected` / `needs reconnect` status (mirror Gmail). If the connect router has an allow-list, add `google_drive`.
- The callback stores the encrypted token exactly like Gmail. Nothing Drive-specific here.

### 2. Drive upload client — `engines/integration/google_drive.py`
A thin client that, given a valid access token, uploads a `.docx` and **converts to a Google Doc**:
- **Create + convert:** `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=false`
  - multipart body: part 1 = JSON metadata `{ "name": "<Name> — <Role>", "mimeType": "application/vnd.google-apps.document" }` (the target `google-apps.document` mimeType is what triggers **.docx → native Google Doc conversion**); part 2 = the `.docx` bytes with `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  - request `fields=id,webViewLink,name`.
- **Return** `{ fileId, webViewLink, name }`. `webViewLink` is the editable Google Docs URL.
- **Optional (recommended): idempotent re-export.** Persist a per-document mapping `{ internal_doc_id → drive_fileId }` (new small store or a field on the document). If a mapping exists, **update** that file's content instead of creating a duplicate: `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media` with the new `.docx` bytes (keeps the same Google Doc URL across re-exports). If not, create and save the mapping. First version can skip this and always create a new Doc.
- **HTTP client:** reuse the project's existing async HTTP wrapper; honor timeouts; surface Google error bodies.
- **Token refresh:** before the call, if the access token is expired, use `IntegrationEngine._refresh` (Google omits a new refresh token on refresh — existing code already preserves the old one).
- **Mockable:** define a small interface so tests inject a fake (return a canned `webViewLink`) under `oauth_mode != "live"`, consistent with the existing `MockTokenExchanger` pattern.

### 3. Action endpoint
`POST /api/v1/resumes/{id}/open-in-google-docs` and `POST /api/v1/cover-letters/{id}/open-in-google-docs`:
1. Auth + ownership (same guards as the export endpoints).
2. If the user has **no connected Drive token**, return **409** (or 428) with a body like `{ "error": "drive_not_connected", "connect_url": "<authorize_url for google_drive>" }` so the frontend can kick off OAuth, then retry. Do not 500.
3. Render the current active version to `.docx` (reuse the export path).
4. Upload+convert via the Drive client (refreshing the token if needed).
5. Return `{ "web_view_link": "...", "file_id": "...", "name": "..." }`.
6. On Drive API failure (401 after refresh, quota, network): return a clear 4xx/5xx with a message; the frontend shows error + Retry (never silent). A 401 that refresh can't fix → treat as disconnected (return the `drive_not_connected` shape) so the user can reconnect.
7. **AI-usage / plan:** none — this is a plain export; no LLM, no plan gate. Available to all tiers.

### 4. Frontend hook (small change to P91)
- When Drive **is** connected, the **"Open in Google Docs"** menu item calls the endpoint, shows "Opening in Google Docs…", then `window.open(web_view_link, "_blank")`.
- When it returns `drive_not_connected`, start the Drive OAuth (existing connect flow / `connect_url`); on return, retry the export automatically.
- Keep the **download-`.docx`** item as the no-connection fallback (and for Word/Pages). Surface **"Connect Google Drive"** in the Connect hub (P71/P72) alongside Gmail/iCloud.

---

## Config / ops
- **Env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (already present for Gmail/Sign-in). No new secret.
- **Google Cloud console:** add the `drive.file` scope to the OAuth consent screen; ensure the production redirect (`{oauth_redirect_base}/google_drive`) is a registered redirect URI. `drive.file` is a **non-restricted** scope (app-created files only), so it avoids the heavy Google security assessment that full-Drive scopes require — a key reason to keep `drive.file`.
- **Feature flag (optional):** `JOBSEARCH_GOOGLE_DRIVE_ENABLED` to hide the one-click item until the consent screen is live; the P91 download-and-import flow stays as the default meanwhile.

## Security & privacy
- **Least privilege:** `drive.file` only — never request `drive` or `drive.readonly`. The app can touch only the Docs it creates; it cannot read the user's existing Drive.
- **Token handling:** Drive tokens are encrypted at rest in the existing `OAuthToken` store; never logged, never returned to the client. Refresh via the existing path.
- **User-initiated only:** a Doc is created **only** when the user clicks "Open in Google Docs" for a specific document — never in the background, never from observed/web content.
- **Disconnect/revoke:** "Disconnect Google Drive" in Connect calls the existing revoke + deletes the stored token; note that already-created Docs remain in the user's Drive (they own them).
- **Admin dashboard:** never surface Drive file content or links; connection status only (consistent with the existing privacy rule).

## Tests (`tests/test_google_drive_export.py`)
- Connect flow: `authorize_url` for `google_drive` carries the `drive.file` scope + `access_type=offline`; callback stores an encrypted token.
- Endpoint without a connected token → **409 `drive_not_connected`** with a `connect_url`.
- Endpoint with a (mock) token → renders `.docx`, calls the Drive client, returns `web_view_link`; assert the client received the **`application/vnd.google-apps.document`** target mimeType (conversion) and the real `.docx` bytes.
- Expired access token → `_refresh` is invoked, then the upload proceeds.
- Idempotent re-export (if implemented): second call PATCHes the same `fileId` and returns the same `web_view_link`.
- Owner-scoped: user B cannot export user A's document (404).
- `oauth_mode != "live"` uses the mock Drive client (no network).

## Acceptance
With Google Drive connected, clicking **Open in Google Docs** on a résumé or cover letter uploads the **current version** to the user's Drive as a **native, editable Google Doc** and opens it in a new tab; without a connection it prompts the one-time Drive OAuth (least-privilege `drive.file`) and then completes; failures show error + Retry (never silent); the existing download-`.docx`/PDF/Copy/original items (P91) still work; Drive tokens are encrypted and the integration is user-initiated, revocable, and never exposes Drive contents.
