/**
 * API reachability signal.
 *
 * A tiny module-level flag that flips whenever an API request tells us something
 * about whether the current host can actually reach the backend:
 *  - a request that never got a response (a transport failure / timeout) → unreachable
 *  - any response at all (even a 401/404/500) → reachable, since the host replied
 *
 * The API layer reports these; the app shell subscribes and surfaces a banner
 * pointing at the published site — which (unlike some preview hosts) can make
 * the cross-origin API calls — instead of leaving the user on a dead spinner.
 */

type ReachabilityListener = (unreachable: boolean) => void;

let unreachable = false;
const listeners = new Set<ReachabilityListener>();

/** Current belief about whether the API host is reachable. */
export function isApiUnreachable(): boolean {
  return unreachable;
}

/**
 * Subscribe to reachability changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe function.
 */
export function subscribeApiReachability(listener: ReachabilityListener): () => void {
  listeners.add(listener);
  listener(unreachable);
  return () => {
    listeners.delete(listener);
  };
}

function setUnreachable(next: boolean): void {
  if (next === unreachable) return;
  unreachable = next;
  for (const listener of Array.from(listeners)) {
    try {
      listener(next);
    } catch {
      /* a bad listener must never break the others */
    }
  }
}

/** A request failed to reach the server (no response at all). */
export function reportApiUnreachable(): void {
  setUnreachable(true);
}

/** A request received a response — the host reached the server. */
export function reportApiReachable(): void {
  setUnreachable(false);
}