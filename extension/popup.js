// Project Harbor Connect — reads the current job-site session (cookies) and hands it
// to Project Harbor against the pairing code. The password is never read or sent;
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

  if (!code) return setStatus("Enter the pairing code from Project Harbor.", "err");

  btn.disabled = true;
  setStatus("Reading your " + provider + " session…", "muted");
  try {
    const { count, storage_state } = await buildStorageState(provider);
    if (count === 0) {
      setStatus(`No ${provider} session found. Log into ${provider} in this browser, then try again.`, "err");
      btn.disabled = false;
      return;
    }
    setStatus(`Sending ${count} cookies to Project Harbor…`, "muted");
    await chrome.storage.local.set({ apiBase });
    const res = await fetch(apiBase + "/api/v1/auto-apply/sessions/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, storage_state, label }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(`✓ ${provider} connected (${data.status}). Return to Project Harbor.`, "ok");
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

function setPullStatus(msg, kind) {
  const el = $("pullStatus");
  el.textContent = msg;
  el.className = "status " + (kind || "muted");
}

// Injected into the active board tab. Provider-AGNOSTIC: a per-host config gives
// the job-detail URL pattern + source key; everything else is generic DOM reading.
// Returns {source, jobs:[{source_platform, external_id, url, title, company,
// location, remote, salary_range?}]}. Best-effort — selectors drift per board.
function scrapeBoardJobs() {
  const host = location.hostname.replace(/^www\./, "");
  const CFG = {
    "linkedin.com":    { source: "linkedin",    re: /\/jobs\/view\/(\d+)/,            url: (id) => "https://www.linkedin.com/jobs/view/" + id },
    "indeed.com":      { source: "indeed",       re: /[?&]jk=([0-9a-z]+)/,             url: (id) => "https://www.indeed.com/viewjob?jk=" + id },
    "glassdoor.com":   { source: "glassdoor",    re: /jobListingId=(\d+)/,             url: (id) => "https://www.glassdoor.com/job-listing/?jl=" + id },
    "dice.com":        { source: "dice",         re: /\/job-detail\/([0-9a-f-]+)/i,    url: (id) => "https://www.dice.com/job-detail/" + id },
    "ziprecruiter.com":{ source: "ziprecruiter", re: /\/(?:jobs|c)\/[^?#]*?([A-Za-z0-9_-]{8,})/, url: null },
    "monster.com":     { source: "monster",      re: /\/job-openings\/[^?#]*?([a-f0-9-]{8,})/i,  url: null },
  };
  let cfg = null;
  for (const k in CFG) { if (host === k || host.endsWith("." + k)) { cfg = CFG[k]; break; } }
  if (!cfg) cfg = { source: (host.split(".").slice(-2, -1)[0] || host),
                    re: /(?:job[-/](?:view|detail|listing|openings)|viewjob|jobListingId)[^0-9A-Za-z]*([0-9A-Za-z_-]{4,})/i, url: null };
  const jobs = [], seen = new Set();
  document.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href || ""; const m = href.match(cfg.re); if (!m) return;
    const id = m[1] || m[2]; if (!id || seen.has(id)) return; seen.add(id);
    const card = a.closest("li,article,[data-job-id],.job-card-container,div");
    let lines = (card ? card.innerText : "").split("\n").map((s) => s.trim()).filter(Boolean);
    lines = lines.filter((l, i) => l !== lines[i - 1] && !/with verification$/i.test(l));
    const title = (a.getAttribute("aria-label") || a.innerText || lines[0] || "").replace(/\s+/g, " ").trim();
    const locLine = lines.find((l) => /\b[A-Z]{2}\b|Remote|Hybrid|On-site|Metropolitan|United States/.test(l)) || "";
    const company = lines.find((l) => l && l !== title && l !== locLine && !/^\$/.test(l) &&
      !/^(Promoted|Viewed|Easy Apply|Actively|Reposted|\d+ (applicant|school|connection|company))/i.test(l)) || "";
    const sal = lines.find((l) => /\$/.test(l)) || "";
    const job = {
      source_platform: cfg.source, external_id: String(id),
      url: (cfg.url ? cfg.url(id) : href.split("#")[0]),
      title, company, location: locLine,
      remote: /\bRemote\b/i.test(locLine) && !/Hybrid|On-site/i.test(locLine),
    };
    const sm = sal.match(/\$(\d+)K\/yr\s*-\s*\$(\d+)K\/yr/i);
    if (sm) job.salary_range = { minimum: +sm[1] * 1000, maximum: +sm[2] * 1000, currency: "USD" };
    if (title) jobs.push(job);
  });
  return { source: cfg.source, jobs: jobs };
}

async function pullJobs() {
  const btn = $("pull");
  const apiBase = ($("apiBase").value.trim() || API_DEFAULT).replace(/\/+$/, "");
  let refresh = $("refreshToken").value.trim();
  if (!refresh) refresh = (await chrome.storage.local.get("refreshToken")).refreshToken || "";
  if (!refresh) return setPullStatus("Paste your Project Harbor refresh token in Advanced first.", "err");
  await chrome.storage.local.set({ apiBase, refreshToken: refresh });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return setPullStatus("No active tab to read.", "err");
  btn.disabled = true;
  setPullStatus("Reading jobs on this page…", "muted");
  try {
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeBoardJobs });
    const out = (injected && injected[0] && injected[0].result) || { jobs: [] };
    const jobs = out.jobs || [], source = out.source || "";
    if (!jobs.length) {
      setPullStatus("No job listings found here. Open a board's job search or recommended list, then pull.", "err");
      btn.disabled = false; return;
    }
    setPullStatus(`Found ${jobs.length} ${source} job(s) — sending…`, "muted");
    // Mint a short-lived access token from the stored refresh token.
    const tr = await fetch(apiBase + "/api/v1/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!tr.ok) { setPullStatus("Sign-in expired — re-paste your refresh token from Project Harbor.", "err"); btn.disabled = false; return; }
    const td = await tr.json();
    if (td.refresh_token) await chrome.storage.local.set({ refreshToken: td.refresh_token });
    const ing = await fetch(apiBase + "/api/v1/jobs/ingest-external", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + td.access_token },
      body: JSON.stringify({ source, jobs }),
    });
    if (ing.ok) {
      const d = await ing.json();
      setPullStatus(`✓ Added ${d.ingested} new ${source} job(s)` + (d.duplicates ? ` (${d.duplicates} already saved).` : "."), "ok");
    } else {
      let det = ""; try { det = (await ing.json()).detail || ""; } catch (_) { det = await ing.text(); }
      setPullStatus(`Failed (${ing.status}): ${det || "try again"}`, "err");
    }
  } catch (e) {
    setPullStatus("Error: " + ((e && e.message) || e), "err");
  } finally {
    btn.disabled = false;
  }
}

(async function init() {
  $("apiBase").value = await loadApiBase();
  const savedRefresh = (await chrome.storage.local.get("refreshToken")).refreshToken;
  if (savedRefresh) $("refreshToken").value = savedRefresh;
  const detected = await detectProviderFromTab();
  if (detected) {
    $("provider").value = detected;
    setStatus(`Detected ${detected} in the current tab.`, "muted");
  }
  $("connect").addEventListener("click", connect);
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  $("pull").addEventListener("click", pullJobs);
})();
