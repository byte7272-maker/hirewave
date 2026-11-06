/**
 * Session-only instant memory keyed by route: scroll position plus small,
 * ephemeral UI flags (e.g. an open refine/accordion). Lives in sessionStorage
 * so back/forward within the tab feels native with zero latency, and is gone
 * once the tab closes — never a substitute for the durable backend store.
 */

const SCROLL_PREFIX = "hw_route_scroll_";
const UI_PREFIX = "hw_route_ui_";

/** Read a remembered scroll offset for one route key (0 when unset). */
export function readScroll(key: string): number {
  try {
    const raw = sessionStorage.getItem(SCROLL_PREFIX + key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist (or clear, for y ≤ 0) a route's scroll offset. */
export function writeScroll(key: string, y: number): void {
  try {
    if (Number.isFinite(y) && y > 0) {
      sessionStorage.setItem(SCROLL_PREFIX + key, String(Math.round(y)));
    } else {
      sessionStorage.removeItem(SCROLL_PREFIX + key);
    }
  } catch {
    /* storage may be unavailable — scrolling still works for this view */
  }
}

/** Read the remembered transient UI bag for one route key. */
export function readTransient<T extends Record<string, unknown>>(key: string): Partial<T> {
  try {
    const raw = sessionStorage.getItem(UI_PREFIX + key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** Merge a patch into a route's transient UI bag and persist it. */
export function writeTransient(key: string, patch: Record<string, unknown>): void {
  try {
    const merged = { ...readTransient(key), ...patch };
    sessionStorage.setItem(UI_PREFIX + key, JSON.stringify(merged));
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Forget a route's session memory — both its scroll offset and its transient
 * UI bag (the "open panels" such as an expanded refine accordion).
 *
 * Pass a trailing "*" to clear every key sharing that prefix, e.g.
 * "documents/resumes*" clears the list scroll key plus every per-document
 * transient key underneath it. Used by "Reset this page".
 */
export function clearRouteMemory(keys: string | string[]): void {
  const list = Array.isArray(keys) ? keys : [keys];
  try {
    for (const key of list) {
      if (!key) continue;
      if (key.endsWith("*")) {
        const prefix = key.slice(0, -1);
        const doomed: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const storageKey = sessionStorage.key(i);
          if (
            storageKey &&
            (storageKey.startsWith(SCROLL_PREFIX + prefix) ||
              storageKey.startsWith(UI_PREFIX + prefix))
          ) {
            doomed.push(storageKey);
          }
        }
        for (const storageKey of doomed) sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.removeItem(SCROLL_PREFIX + key);
        sessionStorage.removeItem(UI_PREFIX + key);
      }
    }
  } catch {
    /* storage may be unavailable — nothing to clear */
  }
}