import type { RephraseMode } from "./documents";

/**
 * Per-version inline-rephrase memory.
 *
 * When an inline "Ask AI to rephrase" replacement is accepted we record the
 * before/after pair it replaced, keyed by the version that save produced. The
 * version history then shows a compact diff of exactly what the rephrase
 * changed — so a rewrite stays traceable right next to the version it created,
 * mirroring the per-version coverage / figure / findings memory used elsewhere.
 */

/** One accepted rephrase: the text it replaced and the rewrite that landed. */
export interface RephraseDiffEntry {
  before: string;
  after: string;
  mode: RephraseMode;
  /** The preset or custom instruction used (absent for a plain "Rephrase"). */
  instruction?: string;
}

/** Version -> accepted rephrase diffs for one document. */
export type RephraseDiffMap = Record<string, RephraseDiffEntry[]>;

const PREFIX = "hirewave_rephrase_diffs_";
/** Keep only the most recent diffs per version so storage stays bounded. */
const MAX_PER_VERSION = 12;

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

function isEntry(value: unknown): value is RephraseDiffEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.before === "string" &&
    typeof v.after === "string" &&
    (v.mode === "word" || v.mode === "sentence" || v.mode === "paragraph")
  );
}

/** Read every version's accepted rephrase diffs (safe against bad/absent data). */
export function readRephraseDiffs(
  kind: string,
  docId: string | number
): RephraseDiffMap {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: RephraseDiffMap = {};
    for (const [version, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const list = value.filter(isEntry);
        if (list.length) out[version] = list;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Append an accepted rephrase to a version's record and return the updated map. */
export function saveRephraseDiff(
  kind: string,
  docId: string | number,
  version: string | number,
  entry: RephraseDiffEntry
): RephraseDiffMap {
  const map = readRephraseDiffs(kind, docId);
  const key = String(version);
  const next = [...(map[key] ?? []), entry].slice(-MAX_PER_VERSION);
  map[key] = next;
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/** Look up one version's accepted rephrase diffs (empty array when none recorded). */
export function getRephraseDiffs(
  kind: string,
  docId: string | number,
  version: string | number | null | undefined
): RephraseDiffEntry[] {
  if (version === null || version === undefined) return [];
  return readRephraseDiffs(kind, docId)[String(version)] ?? [];
}

/** Forget every recorded rephrase diff for one document. */
export function clearRephraseDiffs(kind: string, docId: string | number): void {
  try {
    localStorage.removeItem(storageKey(kind, docId));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
}