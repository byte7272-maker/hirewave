import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api";
import { listApprovals, type ApprovalItem } from "@/lib/approvals";

// Shared cache for applications parked for approval. The nav badge, the
// dashboard banner, and the Approvals screen all read the same snapshot, so
// approving/rejecting on the screen updates the badge and banner instantly.

interface ApprovalsSnapshot {
  items: ApprovalItem[];
  loading: boolean;
  error: string;
  /** True when the last load failed with a 401 (session expired). */
  unauthorized: boolean;
}

let snapshot: ApprovalsSnapshot = {
  items: [],
  loading: false,
  error: "",
  unauthorized: false,
};

const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: ApprovalsSnapshot) {
  snapshot = next;
  emit();
}

/** Replace the pending list with a freshly fetched one. */
function setItems(items: ApprovalItem[]) {
  setSnapshot({ items, loading: false, error: "", unauthorized: false });
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

/** Fetch the pending approvals. Safe to call repeatedly — concurrent calls share one request. */
export async function refreshApprovals(opts: { silent?: boolean } = {}): Promise<void> {
  if (inflight) return inflight;
  const silent = opts.silent === true;
  // A quiet background poll must never flash a spinner over the visible queue.
  if (!silent) setSnapshot({ ...snapshot, loading: true, error: "" });
  inflight = (async () => {
    try {
      const list = await listApprovals();
      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      const unauthorized = err instanceof ApiError && err.status === 401;
      // During a silent poll, keep the last good queue on a transient error so
      // the screen doesn't flicker — but still surface an expired session.
      if (silent && !unauthorized) return;
      setSnapshot({
        ...snapshot,
        loading: false,
        error: err instanceof Error ? err.message : "Could not load applications awaiting approval.",
        unauthorized,
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop a card locally after it has been acted on. */
export function removeApproval(id: string | number) {
  setItems(snapshot.items.filter((item) => String(item.application_id) !== String(id)));
}

export function useApprovals() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    items: snap.items,
    loading: snap.loading,
    error: snap.error,
    unauthorized: snap.unauthorized,
    pendingCount: snap.items.length,
    refresh: refreshApprovals,
    remove: removeApproval,
  };
}