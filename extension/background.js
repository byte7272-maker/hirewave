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

function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname;
  if (/^(localhost|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|127\.)/i.test(h)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]" || h === "::1") return null;
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

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit", redirect: "follow", signal: ctrl.signal });
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
  const r = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), 12000);
  if (!r.ok || !r.body) return { ok: false, error: "search failed (" + (r.status || "no response") + ")" };
  return { ok: true, results: parseSearchResults(r.body, Math.min(Math.max(max || 6, 1), 10)) };
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
