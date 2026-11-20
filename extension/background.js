// Project Harbor Connect — background service worker.
//
// Code-free connect: the Project Harbor web app sends one message (relayed by our
// content script, which runs only on the app origin) with the provider + the
// user's own short-lived access token. We read that job site's session cookies
// and post them to Project Harbor authenticated as the user — so the user NEVER
// copies a pairing code.
//
// The password is never read (cookies only). The token is the user's own session,
// used once for this call and not stored. Messages arrive only via the content
// script, which is injected only on the Project Harbor app origin.

const API_DEFAULT = "https://hirewave-production-3db3.up.railway.app";

// provider -> cookie domain (covers subdomains).
const DOMAINS = {
  linkedin: "linkedin.com",
  indeed: "indeed.com",
  glassdoor: "glassdoor.com",
  greenhouse: "greenhouse.io",
  workday: "workday.com",
  ziprecruiter: "ziprecruiter.com",
  dice: "dice.com",
};

function mapSameSite(s) {
  return { no_restriction: "None", lax: "Lax", strict: "Strict", unspecified: "Lax" }[s] || "Lax";
}

// --- open-web research (opt-in; uses the broad OPTIONAL host permission) ------
// The user grants "*://*/*" on demand from the popup (a user gesture). We fetch
// PUBLIC pages with credentials omitted (never the user's logged-in/private view),
// return READABLE TEXT ONLY, and never execute page scripts — the page text is data,
// summarized server-side. Internal/loopback hosts and non-http(s) schemes are refused.
const WEB_ORIGIN = { origins: ["*://*/*"] };

async function hasWebPermission() {
  try { return await chrome.permissions.contains(WEB_ORIGIN); } catch (_) { return false; }
}

// Download extensions we never fetch as research (not readable pages).
var BLOCKED_EXT = /\.(exe|msi|apk|dmg|pkg|bin|scr|bat|cmd|com|jar|app|deb|rpm|appimage|zip|rar|7z|gz|tar|tgz|bz2|xz|iso|img|torrent|pdf|docx?|xlsx?|pptx?|rtf|epub|csv)$/i;
// Hostname labels that mark an adult or torrent/piracy destination (label-exact, so
// "sex" blocks sex.example.com but not essex.com).
var BLOCKED_LABELS = {
  porn: 1, porno: 1, xxx: 1, sex: 1, nsfw: 1, camgirl: 1, camgirls: 1, escort: 1,
  escorts: 1, hentai: 1, nude: 1, nudes: 1, fetish: 1, onlyfans: 1, brazzers: 1,
  xvideos: 1, pornhub: 1, xhamster: 1, redtube: 1, youporn: 1, chaturbate: 1,
  stripchat: 1, torrent: 1, torrents: 1, piratebay: 1, thepiratebay: 1, "1337x": 1,
  rarbg: 1, yts: 1, nyaa: 1, kickass: 1, kickasstorrents: 1, limetorrents: 1,
  torrentz: 1, warez: 1, crack: 1, cracked: 1, keygen: 1, nulled: 1
};
// Adult/torrent/piracy search terms — reject the query outright.
var BLOCKED_QUERY = /\b(porn\w*|pornography|xxx|nsfw|hentai|nudes?|camgirls?|escort\w*|fetish|onlyfans|torrent\w*|magnet\s*link|piratebay|the\s*pirate\s*bay|1337x|rarbg|yts|kickass|limetorrent\w*|warez|keygen|nulled)\b/i;

function hostBlocked(host) {
  host = String(host || "").toLowerCase();
  var labels = host.split(".");
  for (var i = 0; i < labels.length; i++) if (BLOCKED_LABELS[labels[i]]) return true;
  return false;
}

function safeUrl(raw) {
  var u;
  try { u = new URL(raw); } catch (_) { return null; }
  // HTTPS only — no insecure http:// or any other scheme.
  if (u.protocol !== "https:") return null;
  // Only the default HTTPS port.
  if (u.port && u.port !== "443") return null;
  // No credentials in the URL.
  if (u.username || u.password) return null;
  var h = (u.hostname || "").replace(/^\[|\]$/g, "");
  if (!h) return null;
  // Reject any raw IP-literal host (v4 or v6), public or private.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;        // IPv4
  if (/:/.test(h) || /^[0-9a-f]*::/i.test(h)) return null;    // IPv6
  if (hostBlocked(h)) return null;
  if (BLOCKED_EXT.test(u.pathname || "")) return null;        // file download
  return u.toString();
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function extractReadable(html) {
  let title = "";
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) title = stripTags(tm[1]).slice(0, 200);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
  return { title, text: stripTags(body).slice(0, 20000) };
}

function decodeResultHref(href) {
  try {
    const u = new URL(href.startsWith("//") ? "https:" + href : href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : u.toString();
  } catch (_) { return href; }
}

function parseSearchResults(html, max) {
  const results = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < max) {
    const url = decodeResultHref(m[1]);
    const title = stripTags(m[2]);
    if (url && title && /^https?:/i.test(url)) results.push({ title, url, snippet: "" });
  }
  const sre = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let i = 0, sm;
  while ((sm = sre.exec(html)) && i < results.length) { results[i].snippet = stripTags(sm[1]).slice(0, 300); i++; }
  return results;
}

// `creds` defaults to "omit" (open-web research stays cookieless for privacy). The
// job-enrichment path passes "include" so boards the user is signed into (Indeed,
// LinkedIn) serve the real posting instead of a bot-challenge — the cookies go only to
// the board (first party), never to our server; we receive just the HTML.
async function fetchText(url, timeoutMs, creds) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, { method: "GET", credentials: creds || "omit", redirect: "follow", signal: ctrl.signal });
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ct) && ct) {
      return { ok: false, status: res.status, error: "unsupported content type" };
    }
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 400000) };
  } finally {
    clearTimeout(t);
  }
}

async function researchSearch(query, max) {
  if (!(await hasWebPermission())) return { ok: false, needsPermission: true, error: "web research not enabled" };
  const q = String(query || "").trim().slice(0, 200);
  if (!q) return { ok: false, error: "empty query" };
  // Safety: never run an adult/torrent/piracy search.
  if (BLOCKED_QUERY.test(q)) return { ok: false, error: "blocked search term" };
  const r = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), 12000);
  if (!r.ok || !r.body) return { ok: false, error: "search failed (" + (r.status || "no response") + ")" };
  // Drop any unsafe result URLs so the app never offers them to fetch.
  const results = parseSearchResults(r.body, Math.min(Math.max(max || 6, 1), 10))
    .filter(function (res) { return res && res.url && safeUrl(res.url); });
  return { ok: true, results: results };
}

async function researchFetch(rawUrl) {
  if (!(await hasWebPermission())) return { ok: false, needsPermission: true, error: "web research not enabled" };
  const url = safeUrl(rawUrl);
  if (!url) return { ok: false, error: "unsupported or private URL" };
  const r = await fetchText(url, 12000);
  if (!r.ok || !r.body) return { ok: false, error: "fetch failed (" + (r.status || "no response") + ")" };
  const { title, text } = extractReadable(r.body);
  return { ok: true, data: { url, title, text } };
}

// --- fill in pay/benefits the server can't reach ----------------------------
// Boards like Indeed/LinkedIn block server-side fetches, so salary never lands on
// those matches. The extension CAN read the public posting (host permissions +
// the user's own connection). We ask the backend which of the user's jobs still
// need their full posting, fetch each page here, and POST the HTML back so the
// server parses salary/benefits/location/workplace from it. Public pages only
// (credentials omitted); the HTML is data, parsed server-side, never executed.
async function mintAccess(apiBase) {
  const store = await chrome.storage.local.get(["refreshToken", "apiBase"]);
  const base = (store.apiBase || apiBase || API_DEFAULT).replace(/\/+$/, "");
  if (!store.refreshToken) return { error: "not linked — open Project Harbor to link the extension" };
  const tr = await fetch(base + "/api/v1/auth/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: store.refreshToken }),
  });
  if (!tr.ok) return { error: "sign-in expired — re-link the extension" };
  const td = await tr.json();
  if (td.refresh_token) await chrome.storage.local.set({ refreshToken: td.refresh_token });
  return { base, token: td.access_token };
}

// Wait for a background tab to finish loading (or time out).
function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { chrome.tabs.onUpdated.removeListener(listener); } catch (_) { /* no-op */ }
      resolve(ok);
    };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") finish(true); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => finish(false), timeoutMs || 15000);
  });
}

// Some boards (Indeed, LinkedIn) block a background `fetch` (anti-bot + CORS on their
// cts.* redirectors) even with cookies. A real tab navigation isn't blocked: open the
// URL in an inactive background tab, let it resolve + render, read its HTML, close it.
// A board job page resolves through a redirector (cts.indeed.com → /viewjob) and then
// hydrates — and a background/inactive tab is throttled, so a single read right after
// "complete" often catches the redirect page, not the posting. Poll the tab's HTML
// until it actually carries job content (up to ~10s), returning as soon as it does.
const _JOB_CONTENT_RE = /salaryInfoModel|salaryText|jobDescriptionText|formattedLocation|"@type"\s*:\s*"JobPosting"/i;

async function fetchViaTab(url) {
  let tab;
  try { tab = await chrome.tabs.create({ url, active: false }); }
  catch (_) { return ""; }
  try {
    await waitTabComplete(tab.id, 15000);
    let last = "";
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 800));
      let html = "";
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.documentElement.outerHTML,
        });
        html = (res && res[0] && res[0].result) || "";
      } catch (_) { html = ""; }
      if (html.length > 50000) last = html; // keep the fullest page seen as a fallback
      if (html.length > 20000 && _JOB_CONTENT_RE.test(html)) return html.slice(0, 1500000);
    }
    return last.slice(0, 1500000);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (_) { /* tab may already be gone */ }
  }
}

async function enrichJobs(max) {
  const a = await mintAccess();
  if (a.error) return { ok: false, error: a.error };
  const cap = Math.min(Math.max(max || 15, 1), 40);
  const qr = await fetch(a.base + "/api/v1/jobs/enrichment-queue?limit=" + cap, {
    headers: { Authorization: "Bearer " + a.token },
  });
  if (!qr.ok) return { ok: false, error: "couldn't read the enrichment queue (" + qr.status + ")" };
  const items = ((await qr.json()).items || []).slice(0, cap);
  let processed = 0, updated = 0, failed = 0, viaTab = 0;
  for (const it of items) {
    if (!it || !it.url || !it.job_id) continue;
    let html = "";
    try {
      const r = await fetchText(it.url, 12000, "include"); // cookied fetch: fast path for ATS boards
      if (r.ok && r.body) html = r.body;
    } catch (_) { html = ""; }
    if (html.length < 1000) { // blocked/empty (Indeed/LinkedIn) → real tab navigation
      const viaHtml = await fetchViaTab(it.url);
      if (viaHtml) { html = viaHtml; viaTab++; }
    }
    if (!html) { failed++; continue; }
    processed++;
    try {
      const pr = await fetch(a.base + "/api/v1/jobs/" + encodeURIComponent(it.job_id) + "/jd", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
        body: JSON.stringify({ html, url: it.url }),
      });
      if (pr.ok) { const d = await pr.json(); if (d && d.updated) updated++; }
    } catch (_) { /* a single bad post never stops the batch */ }
  }
  return { ok: true, queued: items.length, processed, updated, failed, viaTab };
}

// --- résumé sync to a board's profile (assisted upload) ----------------------
// The apply_sync.js content script (on a board profile page) asks for the user's
// current résumé FILE for this board; we mint a token, ask the backend which résumé
// is pinned to this board and where to download it, fetch the bytes authenticated as
// the user, and hand them back base64-encoded. The content script sets the file on the
// board's own upload input — the user reviews and saves. Then "mark" records the new
// live version. No credential is read; the file is the user's own.
function bytesToBase64(buf) {
  var bytes = new Uint8Array(buf);
  var bin = "";
  var CHUNK = 0x8000; // avoid call-stack limits on large files
  for (var i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function syncFetch(board) {
  board = String(board || "").toLowerCase();
  if (!board) return { ok: false, error: "unknown board" };
  const a = await mintAccess();
  if (a.error) return { ok: false, error: a.error };
  // Ask the backend which résumé is this board's profile default + where to download it.
  const pr = await fetch(a.base + "/api/v1/documents/board-sync/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ board: board, doc_type: "resume" }),
  });
  if (!pr.ok) {
    let d = ""; try { d = (await pr.json()).detail || ""; } catch (_) { d = ""; }
    return { ok: false, error: `(${pr.status}) ${d || "couldn't prepare the résumé for this site"}` };
  }
  const prep = await pr.json();
  const dl = String(prep.download_url || "");
  if (!dl) return { ok: false, error: "no résumé file to upload" };
  const fr = await fetch(a.base + dl, { headers: { Authorization: "Bearer " + a.token } });
  if (!fr.ok) return { ok: false, error: `couldn't download the résumé (${fr.status})` };
  const buf = await fr.arrayBuffer();
  const contentType = fr.headers.get("content-type") || "application/pdf";
  // Filename from the download URL (export.pdf) or the content disposition.
  let filename = dl.split("/").pop() || "resume.pdf";
  const cd = fr.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/i);
  if (m) filename = m[1];
  if (!/\.[a-z0-9]{2,4}$/i.test(filename)) filename += contentType.indexOf("pdf") >= 0 ? ".pdf" : ".docx";
  return {
    ok: true,
    board: board,
    resume_id: prep.resume_id || "",
    resume_label: prep.resume_label || "",
    filename: filename,
    contentType: contentType,
    b64: bytesToBase64(buf),
    steps: prep.steps || [],
    manage_url: prep.manage_url || "",
    privacy_note: prep.privacy_note || "",
  };
}

async function syncMark(board, resumeId) {
  board = String(board || "").toLowerCase();
  if (!board) return { ok: false, error: "unknown board" };
  const a = await mintAccess();
  if (a.error) return { ok: false, error: a.error };
  const r = await fetch(a.base + "/api/v1/documents/board-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ board: board, doc_type: "resume", resume_id: resumeId || "" }),
  });
  if (!r.ok) return { ok: false, error: `couldn't mark it updated (${r.status})` };
  return { ok: true, data: await r.json() };
}

// Passive enrichment: a content script on a board job page the user is viewing hands
// back that page's HTML; match it to one of the user's saved jobs (by title) server-side
// and fill pay/benefits. The HTML goes only to the user's own account; parsed, not run.
async function passiveEnrich(url, html) {
  if (!html || html.length < 500) return { ok: false, error: "no html" };
  const a = await mintAccess();
  if (a.error) return { ok: false, error: a.error };
  try {
    const r = await fetch(a.base + "/api/v1/jobs/jd-by-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
      body: JSON.stringify({ html: html.slice(0, 1500000), url: url || "" }),
    });
    if (!r.ok) return { ok: false, error: "post failed (" + r.status + ")" };
    return { ok: true, data: await r.json() };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

async function buildStorageState(provider) {
  const domain = DOMAINS[provider];
  if (!domain) return { count: 0, storage_state: "" };
  const cookies = await chrome.cookies.getAll({ domain });
  const mapped = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.session || !c.expirationDate ? -1 : Math.round(c.expirationDate),
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: mapSameSite(c.sameSite),
  }));
  return { count: mapped.length, storage_state: JSON.stringify({ cookies: mapped, origins: [] }) };
}

// The content script (running only on the app origin) relays the app's request
// here. A "ping" lets the app feature-detect the direct (code-free) capability.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") {
        return sendResponse({ ok: false, error: "bad request" });
      }
      if (msg.type === "harbor-ping") {
        return sendResponse({ ok: true, version: chrome.runtime.getManifest().version, direct: true });
      }

      // One-click link: the app (on its own origin) hands the extension the user's own
      // Project Harbor refresh token so pull/fill work with NO copy-paste. The user never
      // sees or handles a token. Stored locally only; used to mint short-lived access
      // tokens for the user's own account.
      if (msg.type === "harbor-session") {
        const patch = {};
        if (msg.refreshToken) patch.refreshToken = msg.refreshToken;
        if (msg.apiBase) patch.apiBase = String(msg.apiBase).replace(/\/+$/, "");
        if (Object.keys(patch).length) await chrome.storage.local.set(patch);
        return sendResponse({ ok: true, linked: !!msg.refreshToken });
      }

      // Live-apply: the apply.js content script (on a job site) sends the form's visible
      // fields; we mint a short-lived access token from the user's stored refresh token
      // and ask the backend to map them to the user's own profile. We hold NO credential
      // and perform no page action — apply.js fills the live form and the user submits.
      if (msg.type === "harbor-field-map") {
        const store = await chrome.storage.local.get(["refreshToken", "apiBase"]);
        const apiBase = (store.apiBase || API_DEFAULT).replace(/\/+$/, "");
        if (!store.refreshToken) {
          return sendResponse({ ok: false, error: "Open Project Harbor and paste your token in the extension (Advanced) first." });
        }
        const tr = await fetch(apiBase + "/api/v1/auth/refresh", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: store.refreshToken }),
        });
        if (!tr.ok) return sendResponse({ ok: false, error: "Sign-in expired — re-paste your token in the extension." });
        const td = await tr.json();
        if (td.refresh_token) await chrome.storage.local.set({ refreshToken: td.refresh_token });
        const res = await fetch(apiBase + "/api/v1/apply/field-map", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + td.access_token },
          body: JSON.stringify({ fields: msg.fields || [], job_id: msg.job_id || "", resume_id: msg.resume_id || "" }),
        });
        if (!res.ok) {
          let d = ""; try { d = (await res.json()).detail || ""; } catch (_) { d = ""; }
          return sendResponse({ ok: false, error: `(${res.status}) ${d || "could not map this form"}` });
        }
        return sendResponse({ ok: true, data: await res.json() });
      }

      // Best-effort outcome ping from apply.js (what got filled) — no-op for now.
      if (msg.type === "harbor-apply-report") {
        return sendResponse({ ok: true });
      }

      // --- open-web research (opt-in; the app has already gotten the user's consent) ---
      // Feature-detect whether the broad web-access permission has been granted.
      if (msg.type === "harbor-research-status") {
        return sendResponse({ ok: true, granted: await hasWebPermission() });
      }
      // Search the open web on the user's connection → [{title,url,snippet}].
      if (msg.type === "harbor-research-search") {
        return sendResponse(await researchSearch(msg.query, msg.max));
      }
      // Fetch one public page → {url,title,text} (readable text only).
      if (msg.type === "harbor-research-fetch") {
        return sendResponse(await researchFetch(msg.url));
      }
      // Fill in pay/benefits the server can't reach: fetch the user's job postings on
      // their connection and hand the HTML back for server-side parsing.
      if (msg.type === "harbor-enrich-jobs") {
        return sendResponse(await enrichJobs(msg.max));
      }
      // Passive enrichment from a board job page the user is viewing (content script).
      if (msg.type === "harbor-passive-enrich") {
        return sendResponse(await passiveEnrich(msg.url, msg.html));
      }
      // Résumé sync: fetch the user's board-pinned résumé file for an assisted upload.
      if (msg.type === "harbor-sync-fetch") {
        return sendResponse(await syncFetch(msg.board));
      }
      // Record that the board now holds the current résumé version (clears drift).
      if (msg.type === "harbor-sync-mark") {
        return sendResponse(await syncMark(msg.board, msg.resume_id));
      }

      if (msg.type !== "harbor-connect") {
        return sendResponse({ ok: false, error: "unknown request" });
      }
      const provider = String(msg.provider || "").toLowerCase();
      const token = msg.token;
      const apiBase = (msg.apiBase || API_DEFAULT).replace(/\/+$/, "");
      const label = msg.label || "";
      if (!provider || !DOMAINS[provider]) return sendResponse({ ok: false, error: "unknown provider" });
      if (!token) return sendResponse({ ok: false, error: "not signed in" });

      const { count, storage_state } = await buildStorageState(provider);
      if (count === 0) {
        return sendResponse({
          ok: false,
          error: `No ${provider} session found — log into ${provider} in this browser first.`,
        });
      }
      const res = await fetch(apiBase + "/api/v1/auto-apply/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ provider, storage_state, label }),
      });
      if (res.ok) {
        const data = await res.json();
        return sendResponse({ ok: true, provider, status: data.status, count });
      }
      let detail = "";
      try { detail = (await res.json()).detail || ""; } catch (_) { detail = await res.text(); }
      return sendResponse({ ok: false, error: `(${res.status}) ${detail || "connect failed"}` });
    } catch (e) {
      return sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the message channel open for the async response
});
