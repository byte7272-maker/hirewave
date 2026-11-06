/**
 * The single most-recently-opened document, so the Documents page can offer a
 * "Jump back in" shortcut. Stored locally per browser — ids, kind, title, and
 * the version last in progress only, never the document itself.
 */

import { classifyApiError } from "./api";
import { getCoverLetter, getResume } from "./documents";
import { listRecentlyViewed } from "./recentlyViewed";

export type RecentDocumentKind = "resume" | "cover-letter";

export interface RecentDocument {
  kind: RecentDocumentKind;
  id: string | number;
  title: string;
  /** The version the document was last viewed/edited on, so reopening lands there. */
  version?: string | number;
  /** Epoch millis of when it was last opened. */
  ts: number;
}

const KEY = "hirewave_recent_document";

/** Record the document just opened (overwrites the previous pointer). */
export function rememberRecentDocument(doc: {
  kind: RecentDocumentKind;
  id: string | number;
  title: string;
  version?: string | number;
}): void {
  try {
    const record: RecentDocument = { ...doc, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage may be unavailable — the shortcut just won't persist */
  }
}

/** Read the most-recently-opened document (null when none / unreadable). */
export function readRecentDocument(): RecentDocument | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (
      (rec.kind === "resume" || rec.kind === "cover-letter") &&
      rec.id !== undefined &&
      rec.id !== null
    ) {
      const version =
        rec.version === undefined || rec.version === null ? undefined : (rec.version as string | number);
      return {
        kind: rec.kind,
        id: rec.id as string | number,
        title: typeof rec.title === "string" ? rec.title : "",
        version,
        ts: typeof rec.ts === "number" ? rec.ts : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Forget the pointer. */
export function clearRecentDocument(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * The most recent DOCUMENT on the cross-device recently-viewed rail, reshaped
 * as a {@link RecentDocument}. Used as the fallback when the locally-remembered
 * document has been deleted. Returns null when the rail has no documents.
 */
async function mostRecentDocumentFromRail(): Promise<RecentDocument | null> {
  try {
    const rail = await listRecentlyViewed(12);
    const doc = rail.find((e) => e.kind === "resume" || e.kind === "cover_letter");
    if (!doc) return null;
    return {
      kind: doc.kind === "cover_letter" ? "cover-letter" : "resume",
      id: doc.ref_id,
      title: doc.title,
      ts: doc.ts ?? Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve what the Documents "Jump back in" card should show.
 *
 * - No local pointer → null (stay out of the way).
 * - Pointer still exists → show it (carrying the version in progress).
 * - Pointer was deleted (a real 404 from a reachable server) → forget it and
 *   fall back to the newest document on the dashboard's recently-viewed rail,
 *   so the card never opens a dead document.
 * - A network / auth / other failure → keep the local pointer untouched; we
 *   can't tell whether it's gone, so we never replace the user's real shortcut
 *   with a guess.
 */
export async function resolveRecentDocument(): Promise<RecentDocument | null> {
  const local = readRecentDocument();
  if (!local) return null;
  // Preview build has no backend — the local pointer is the whole story.
  if (__IS_PREVIEW__) return local;

  try {
    if (local.kind === "resume") await getResume(local.id);
    else await getCoverLetter(local.id);
    return local;
  } catch (err) {
    if (classifyApiError(err) === "not-found") {
      clearRecentDocument();
      return mostRecentDocumentFromRail();
    }
    // Can't reach the server (or session expired) — trust the local pointer.
    return local;
  }
}