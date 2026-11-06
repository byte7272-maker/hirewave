/**
 * Remembers whether the versions marquee's "Hide identical" toggle is left on,
 * PER document, so a résumé (or cover letter) reopens with the same preference
 * the user left it in. Keyed by document kind + id, so two documents never share
 * the setting. Best-effort: storage failures are swallowed and fall back to off.
 */

const STORAGE_PREFIX = "hirewave_versions_hide_identical_";
const SCROLL_PREFIX = "hirewave_versions_rail_scroll_";

/** The storage key for one document (e.g. `resume:42`). */
function keyFor(kind: string, docId: string | number): string {
  return `${STORAGE_PREFIX}${kind}:${docId}`;
}

/** The scroll-memory key for one document. */
function scrollKeyFor(kind: string, docId: string | number): string {
  return `${SCROLL_PREFIX}${kind}:${docId}`;
}

/** Whether versions identical to the current one were hidden last time. Defaults to off. */
export function readHideIdentical(kind: string, docId: string | number): boolean {
  if (docId === null || docId === undefined || String(docId) === "") return false;
  try {
    return localStorage.getItem(keyFor(kind, docId)) === "1";
  } catch {
    return false;
  }
}

/** Persist the hide-identical choice for one document. */
export function writeHideIdentical(
  kind: string,
  docId: string | number,
  hide: boolean
): void {
  if (docId === null || docId === undefined || String(docId) === "") return;
  try {
    if (hide) localStorage.setItem(keyFor(kind, docId), "1");
    else localStorage.removeItem(keyFor(kind, docId));
  } catch {
    /* Storage may be unavailable — the choice still applies for this session. */
  }
}

/**
 * The horizontal offset (px) the versions marquee was last scrolled to for one
 * document, or null when nothing was remembered. Best-effort: storage failures
 * fall back to null (which makes the strip centre the current version instead).
 */
export function readRailScroll(kind: string, docId: string | number): number | null {
  if (docId === null || docId === undefined || String(docId) === "") return null;
  try {
    const raw = localStorage.getItem(scrollKeyFor(kind, docId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Persist the marquee's horizontal offset for one document. A near-zero offset
 * (i.e. parked at the newest end) is cleared, so a fresh rail can centre itself.
 */
export function writeRailScroll(
  kind: string,
  docId: string | number,
  left: number
): void {
  if (docId === null || docId === undefined || String(docId) === "") return;
  try {
    if (!Number.isFinite(left) || left <= 2) {
      localStorage.removeItem(scrollKeyFor(kind, docId));
    } else {
      localStorage.setItem(scrollKeyFor(kind, docId), String(Math.round(left)));
    }
  } catch {
    /* Storage may be unavailable — the position still applies for this session. */
  }
}