// Hirewave Connect — reads the current job-site session (cookies) and hands it
// to Hirewave against the pairing code. The password is never read or sent;
// extensions read cookies via chrome.cookies, which the site set after *you*
// logged in on the provider's own page.

const API_DEFAULT = "https://hirewave-production-3db3.up.railway.app";

// provider -> the cookie domain to collect (covers subdomains).
const DOMAINS = {
  linkedin: "linkedin.com",
  indeed: "indeed.com",
  glassdoor: "glassdoor.com",
  greenhouse: "greenhouse.io",
  workday: "workday.com",
  ziprecruiter: "ziprecruiter.com",
  dice: "dice.com",
};

// hostname suffix -> provider, for auto-detecting from the active tab.
const HOST_TO_PROVIDER = {
  "linkedin.com": "linkedin",
  "indeed.com": "indeed",
  "glassdoor.com": "glassdoor",
  "greenhouse.io": "greenhouse",
  "myworkday.com": "workday",
  "workday.com": "workday",
  "ziprecruiter.com": "ziprecruiter",
  "dice.com": "dice",
};

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (kind || "muted");
}

function mapSameSite(s) {
  return { no_restriction: "None", lax: "Lax", strict: "Strict", unspecified: "Lax" }[s] || "Lax";
}

// Build a Playwright-compatible storage_state from the site's cookies.
async function buildStorageState(provider) {
  const domain = DOMAINS[provider];
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

async function detectProviderFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const host = new URL(tab.url).hostname;
    for (const [suffix, provider] of Object.entries(HOST_TO_PROVIDER)) {
      if (host === suffix || host.endsWith("." + suffix)) return provider;
    }
  } catch (_) {}
  return null;
}

async function loadApiBase() {
  const stored = await chrome.storage.local.get("apiBase");
  return stored.apiBase || API_DEFAULT;
}

async function connect() {
  const btn = $("connect");
  const provider = $("provider").value;
  const code = $("code").value.trim();
  const label = $("label").value.trim();
  const apiBase = ($("apiBase").value.trim() || API_DEFAULT).replace(/\/+$/, "");

  if (!code) return setStatus("Enter the pairing code from Hirewave.", "err");

  btn.disabled = true;
  setStatus("Reading your " + provider + " session…", "muted");
  try {
    const { count, storage_state } = await buildStorageState(provider);
    if (count === 0) {
      setStatus(`No ${provider} session found. Log into ${provider} in this browser, then try again.`, "err");
      btn.disabled = false;
      return;
    }
    setStatus(`Sending ${count} cookies to Hirewave…`, "muted");
    await chrome.storage.local.set({ apiBase });
    const res = await fetch(apiBase + "/api/v1/auto-apply/sessions/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, storage_state, label }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(`✓ ${provider} connected (${data.status}). Return to Hirewave.`, "ok");
    } else {
      let detail = "";
      try { detail = (await res.json()).detail || ""; } catch (_) { detail = await res.text(); }
      setStatus(`Failed (${res.status}): ${detail || "please reissue the code and retry."}`, "err");
    }
  } catch (e) {
    setStatus("Error: " + (e && e.message ? e.message : String(e)), "err");
  } finally {
    btn.disabled = false;
  }
}

(async function init() {
  $("apiBase").value = await loadApiBase();
  const detected = await detectProviderFromTab();
  if (detected) {
    $("provider").value = detected;
    setStatus(`Detected ${detected} in the current tab.`, "muted");
  }
  $("connect").addEventListener("click", connect);
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
})();
