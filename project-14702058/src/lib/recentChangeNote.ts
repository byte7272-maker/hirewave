import { getCoverLetter, getResume, type DocumentVersion } from "./documents";
import type { RecentlyViewedEntry } from "./recentlyViewed";

/** The change note for a document plus the version it came from. */
export interface RecentChangeInfo {
  /** The human summary of the last change, or null when there's nothing worth showing. */
  note: string | null;
  /** The version the note belongs to, so a click can reopen the doc there. */
  version: string | number | null;
}

/** Trim a note and treat blank / stray "null" values as absent. */
function clean(value?: string | null): string | null {
  const text = (value === null || value === undefined ? "" : String(value)).trim();
  if (!text || text === "null" || text === "undefined") return null;
  return text;
}

/**
 * Pick the note to show for a document: the ACTIVE version's change summary,
 * falling back to its label, then to the newest version when the active one
 * carries nothing. Returns { note: null, version: null } when there is nothing
 * worth showing.
 */
function pickInfo(
  versions: DocumentVersion[] | undefined,
  activeVersion: string | number | undefined
): RecentChangeInfo {
  const list = (versions ?? []).filter(Boolean);
  if (list.length === 0) return { note: null, version: null };
  const active = list.find((v) => String(v.version) === String(activeVersion));
  const chosen = active ?? list[list.length - 1];
  const note = clean(chosen?.change_summary) ?? clean(chosen?.label);
  if (!note) return { note: null, version: null };
  return { note, version: chosen?.version ?? null };
}

/**
 * The "last change" info for a recently-viewed document — the human summary of
 * what last changed (e.g. "Rephrased the summary") and the version it belongs
 * to, read from the document's active version. Returns an empty result for
 * non-document entries, when nothing was recorded, or on any failure, so the
 * card simply omits the line instead of showing a broken one.
 */
export async function getRecentChangeInfo(
  entry: RecentlyViewedEntry
): Promise<RecentChangeInfo> {
  const empty: RecentChangeInfo = { note: null, version: null };
  // Preview has no backend — and the recently-viewed rail is empty there anyway.
  if (__IS_PREVIEW__) return empty;
  try {
    if (entry.kind === "resume") {
      const resume = await getResume(entry.ref_id);
      return pickInfo(resume.versions, resume.active_version);
    }
    if (entry.kind === "cover_letter") {
      const letter = await getCoverLetter(entry.ref_id);
      return pickInfo(letter.versions, letter.active_version);
    }
  } catch {
    return empty;
  }
  return empty;
}

/**
 * The "last change note" for a recently-viewed document. Thin wrapper over
 * {@link getRecentChangeInfo} for callers that only need the text.
 */
export async function getRecentChangeNote(
  entry: RecentlyViewedEntry
): Promise<string | null> {
  const info = await getRecentChangeInfo(entry);
  return info.note;
}