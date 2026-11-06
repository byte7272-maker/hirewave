// Bridge to the Connect browser extension (code-free session capture).
//
// The extension's content script runs on this page and tags <html> with
// `data-harbor-connect` (the installed version string). When it is present we talk
// to it over a window.postMessage bridge — no extension id is required, the content
// script relays each request to the extension's background worker.

// ---- Single config point for the Connect extension's Chrome Web Store listing ----
//
// The item is PUBLISHED. This full listing URL drives every install CTA across the
// site (landing teaser, dashboard status, FAQ). Keep the bare listing URL — do not
// append ?authuser= / ?hl= params. Clearing it reverts the UI to the waitlist state.
const EXTENSION_STORE_URL_CONFIG =
  "https://chromewebstore.google.com/detail/project-harbor-connect/apojagpcjhjfplfjfpcmlplhmokoandj";

/** The published store URL, or null while the extension is still in review. */
export const EXTENSION_STORE_URL: string | null = EXTENSION_STORE_URL_CONFIG.trim()
  ? EXTENSION_STORE_URL_CONFIG.trim()
  : null;

/** True once a real store URL is configured (post-approval). Flips the UI C → B automatically. */
export const EXTENSION_STORE_READY = EXTENSION_STORE_URL !== null;

/**
 * Latest published extension version. Bump this whenever a new build ships to the
 * Chrome Web Store so already-installed users see an "Update available" nudge.
 * Single source of truth — compared against the version the content script tags.
 */
export const EXTENSION_LATEST_VERSION = "1.2.3";

/** Event the content script fires once it has injected / tagged the page. */
export const HARBOR_CONNECT_READY_EVENT = "harbor-connect-ready";

/** How the browser can reach the extension. */
export type ExtensionMode =
  /** Extension present and supports direct (code-free) connect. */
  | "direct"
  /** Extension present but too old for code-free — use the pairing code. */
  | "legacy"
  /** Extension not installed. */
  | "absent";

interface HarborResponse {
  ok?: boolean;
  error?: string;
  direct?: boolean;
  version?: string;
  provider?: string;
}

/**
 * Talk to the extension through the content-script relay. Resolves with the
 * extension's response, or `{ ok: false, error }` on timeout / no answer.
 */
function harbor<T = HarborResponse>(
  type: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 20000,
): Promise<T> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ ok: false, error: "no window" } as unknown as T);
      return;
    }

    const reqId = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data as { source?: string; reqId?: string; response?: unknown } | null;
      if (!d || d.source !== "harbor-ext" || d.reqId !== reqId) return;
      window.removeEventListener("message", onMsg);
      resolve((d.response ?? { ok: false, error: "no response" }) as T);
    };

    window.addEventListener("message", onMsg);
    window.postMessage(
      { source: "harbor-app", reqId, type, ...payload },
      window.location.origin,
    );
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve({ ok: false, error: "timeout" } as unknown as T);
    }, timeoutMs);
  });
}

/** The installed version string the content script writes onto <html>, if any. */
export function extensionVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.harborConnect ?? null;
}

/**
 * Subscribe to the extension's readiness signal. The content script fires
 * "harbor-connect-ready" once it injects, which lets us re-detect a late-injected
 * extension without a page refresh. Returns an unsubscribe function.
 */
/**
 * Parse a dotted version ("1.2.3" / "v1.2.3.4") into numeric segments.
 * Missing / non-numeric parts collapse to 0 so comparisons never throw.
 */
function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Compare two dotted versions: >0 when a is newer, <0 when older, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** True when a detected version is older than the latest published build. */
export function isExtensionOutdated(detected: string | null | undefined): boolean {
  if (!detected) return false;
  return compareVersions(detected, EXTENSION_LATEST_VERSION) < 0;
}

/**
 * Subscribe to the extension's readiness signal. The content script fires
 * "harbor-connect-ready" once it injects (carrying `{ version }` when known),
 * which lets us re-detect a late-injected extension without a page refresh.
 * Returns an unsubscribe function.
 */
export function onHarborConnectReady(handler: (version?: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ version?: string } | undefined>).detail;
    handler(detail?.version);
  };
  window.addEventListener(HARBOR_CONNECT_READY_EVENT, listener);
  return () => window.removeEventListener(HARBOR_CONNECT_READY_EVENT, listener);
}

/**
 * Detect what the browser can do, without any user action:
 *  - "absent" → the content script never tagged the page
 *  - "direct" → ping answered with ok + direct (code-free connect available)
 *  - "legacy" → extension present but no code-free path yet (pairing code)
 */
export async function detectExtension(): Promise<ExtensionMode> {
  if (!extensionVersion()) return "absent";
  const ping = await harbor<HarborResponse>("harbor-ping", {}, 2000);
  return ping.ok && ping.direct ? "direct" : "legacy";
}

export interface ExtensionConnectInput {
  provider: string;
  /** Display name of the browser extension, e.g. "Acme Connect" (brand-derived). */
  extensionName?: string;
  /** Current Project Harbor access token, handed to the extension for the capture call. */
  token: string | null;
  apiBase: string;
  /** Human label attached to the captured session (usually the user's email). */
  label?: string;
}

export interface ExtensionConnectResult {
  ok: boolean;
  error?: string;
}

/** Code-free connect: ask the extension to capture + upload the session. */
export async function connectViaExtension(
  input: ExtensionConnectInput,
): Promise<ExtensionConnectResult> {
  if (!extensionVersion()) {
    return {
      ok: false,
      error: `${input.extensionName ?? "The extension"} isn't installed.`,
    };
  }

  const res = await harbor<HarborResponse>(
    "harbor-connect",
    {
      provider: input.provider,
      token: input.token,
      apiBase: input.apiBase,
      label: input.label,
    },
    20000,
  );

  if (res.ok) return { ok: true };
  return { ok: false, error: res.error ?? `Couldn't connect ${input.provider}.` };
}