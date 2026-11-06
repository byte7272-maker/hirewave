import { useEffect, useSyncExternalStore } from "react";
import {
  clearRecentlyViewed,
  listRecentlyViewed,
  type RecentlyViewedEntry,
} from "@/lib/recentlyViewed";
import { readPinnedEntryKey, writePinnedEntryKey } from "@/lib/jumpBackInPin";
import { pickFeaturedEntry } from "@/lib/jumpBackIn";

/**
 * Shared cache for the dashboard "Jump back in" rail. The banner on the
 * overview and the topbar's quick button read the same snapshot, so pinning,
 * clearing, or opening an item anywhere updates the other instantly — and the
 * recently-viewed list is only fetched once per dashboard.
 */

interface JumpBackInSnapshot {
  entries: RecentlyViewedEntry[];
  /** The `kind:ref_id` key pinned as the always-first pick, or null. */
  pinnedKey: string | null;
  loading: boolean;
  /** True once a load has finished, so the UI can tell "empty" from "not yet". */
  loaded: boolean;
}

let snapshot: JumpBackInSnapshot = {
  entries: [],
  pinnedKey: readPinnedEntryKey(),
  loading: false,
  loaded: false,
};

const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: JumpBackInSnapshot) {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Load the rail once. Safe to call from many components — concurrent calls share one request. */
export async function loadJumpBackIn(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && snapshot.loaded) return;
  if (inflight) return inflight;
  setSnapshot({ ...snapshot, loading: true });
  inflight = (async () => {
    try {
      const list = await listRecentlyViewed(12);
      setSnapshot({
        entries: list,
        pinnedKey: readPinnedEntryKey(),
        loading: false,
        loaded: true,
      });
    } catch {
      // Best-effort: an unavailable rail just stays empty, never blocks the page.
      setSnapshot({ ...snapshot, loading: false, loaded: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Pin an entry (its `kind:ref_id` key) as the first pick, or clear it with null. */
export function setPinnedEntry(key: string | null): void {
  writePinnedEntryKey(key);
  setSnapshot({ ...snapshot, pinnedKey: key });
}

/** Forget the whole recently-viewed history and drop the pin. */
export async function clearJumpBackIn(): Promise<void> {
  await clearRecentlyViewed();
  writePinnedEntryKey(null);
  setSnapshot({ entries: [], pinnedKey: null, loading: false, loaded: true });
}

export function useJumpBackIn() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Kick off the shared load on first use; the store dedupes across consumers.
  useEffect(() => {
    loadJumpBackIn();
  }, []);

  return {
    entries: snap.entries,
    pinnedKey: snap.pinnedKey,
    loading: snap.loading,
    loaded: snap.loaded,
    featured: pickFeaturedEntry(snap.entries, snap.pinnedKey),
    setPinned: setPinnedEntry,
    clear: clearJumpBackIn,
    reload: () => loadJumpBackIn({ force: true }),
  };
}