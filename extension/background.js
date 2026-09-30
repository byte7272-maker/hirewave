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
