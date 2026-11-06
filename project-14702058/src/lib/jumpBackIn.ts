import type { NavigateFunction } from "react-router-dom";
import { saveViewState } from "./viewState";
import {
  recentlyViewedPath,
  recentlyViewedTargetId,
  recentlyViewedTargetView,
  type RecentlyViewedEntry,
} from "./recentlyViewed";

/** The rail's stable key for an entry (`kind:ref_id`). */
export function entryKey(entry: RecentlyViewedEntry): string {
  return `${entry.kind}:${entry.ref_id}`;
}

/**
 * The featured pick: the pinned entry when it's present in the rail, otherwise
 * the most recently opened one. Null when there's nothing to jump back to.
 */
export function pickFeaturedEntry(
  entries: RecentlyViewedEntry[],
  pinnedKey: string | null,
): RecentlyViewedEntry | null {
  if (pinnedKey) {
    const pinned = entries.find((e) => entryKey(e) === pinnedKey);
    if (pinned) return pinned;
  }
  return entries[0] ?? null;
}

/**
 * Open an entry where the user left off — the shared path used by the "Jump
 * back in" banner and the dashboard topbar's quick button. Restores the target
 * view's selection and, for a card expanded on the Applications board, carries
 * the router state so the board can re-expand and scroll to it immediately.
 */
export function openRecentlyViewedEntry(
  navigate: NavigateFunction,
  entry: RecentlyViewedEntry,
): void {
  saveViewState(recentlyViewedTargetView(entry), {
    selectedId: recentlyViewedTargetId(entry),
  });
  if (entry.ref_application_id != null) {
    navigate(recentlyViewedPath(entry), {
      state: { expandApplicationId: entry.ref_application_id },
    });
    return;
  }
  navigate(recentlyViewedPath(entry));
}

/**
 * Reopen a document entry at the exact version a "last change" note came from.
 * The detail pages open on a `?version=` query, so the user lands on the change
 * they were reading about.
 */
export function openRecentlyViewedEntryAtVersion(
  navigate: NavigateFunction,
  entry: RecentlyViewedEntry,
  version: string | number,
): void {
  saveViewState(recentlyViewedTargetView(entry), {
    selectedId: recentlyViewedTargetId(entry),
  });
  navigate(`${recentlyViewedPath(entry)}?version=${encodeURIComponent(String(version))}`);
}