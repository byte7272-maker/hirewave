import { useEffect, useSyncExternalStore } from "react";
import { refreshApprovals } from "@/hooks/useApprovalsStore";

const DEFAULT_INTERVAL_MS = 30000;

interface PollStatus {
  /** Epoch ms of the next scheduled background check, or null when idle. */
  nextAt: number | null;
  /** Epoch ms of the most recent background pull, or null. */
  updatedAt: number | null;
  /** Length of one poll cycle in ms — used to compute progress. */
  intervalMs: number;
}

let status: PollStatus = { nextAt: null, updatedAt: null, intervalMs: DEFAULT_INTERVAL_MS };
const statusListeners = new Set<() => void>();

function emitStatus() {
  statusListeners.forEach((listener) => listener());
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function getStatus() {
  return status;
}

function patchStatus(patch: Partial<PollStatus>) {
  status = { ...status, ...patch };
  emitStatus();
}

/**
 * Read the background-poll schedule so a "live" indicator can count down to the
 * next silent refresh. Returns stable values from a shared store.
 */
export function useApprovalsPollStatus() {
  const snap = useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  return { nextAt: snap.nextAt, updatedAt: snap.updatedAt, intervalMs: snap.intervalMs };
}

/**
 * Quietly re-fetch the pending approvals on an interval (and whenever the tab
 * regains focus) so newly parked applications show up in the queue and the nav
 * badge on their own. Silent mode means no spinner and no error banner — a
 * background hiccup leaves the current list untouched.
 */
export function useApprovalsPoll(intervalMs: number = DEFAULT_INTERVAL_MS) {
  useEffect(() => {
    function tick() {
      // Publish the next check time up front so the countdown always restarts,
      // even if this tick is skipped because the tab is hidden.
      patchStatus({ nextAt: Date.now() + intervalMs });
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshApprovals({ silent: true }).then(
        () => patchStatus({ updatedAt: Date.now() }),
        () => {},
      );
    }

    // Start the countdown immediately on mount.
    patchStatus({ nextAt: Date.now() + intervalMs, updatedAt: Date.now(), intervalMs });

    const timer = window.setInterval(tick, intervalMs);
    const onWake = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      patchStatus({ nextAt: null });
    };
  }, [intervalMs]);
}