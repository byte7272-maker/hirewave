import { api } from "./api";

/**
 * Durable per-view state, stored verbatim on the backend.
 *
 * Contract:
 *   GET    /api/v1/view-state/{view}  → the object previously saved (or {})
 *   PUT    /api/v1/view-state/{view}  → stored verbatim and returned
 *   DELETE /api/v1/view-state/{view}  → forget the view ("reset this page")
 *
 * {view} is a short lowercase name ([a-z0-9_-], ≤40 chars) such as
 * "resumes", "cover-letters", "matches", "applications".
 *
 * Saves merge onto the last-known object (spread existing → overwrite changed
 * keys) so a page never clobbers keys it doesn't own. The whole object is kept
 * small — ids and filter values only, never whole records.
 */

const VIEW_PATTERN = /^[a-z0-9_-]{1,40}$/;

type ViewRecord = Record<string, unknown>;

/** Last-known durable object per view — the base we merge each save onto. */
const cache = new Map<string, ViewRecord>();
/** Coalesced, not-yet-flushed patches per view. */
const pending = new Map<string, ViewRecord>();
/** Debounce timers per view (module scope, so a save scheduled just before a
 *  route change still flushes after the component unmounts). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function valid(view: string): boolean {
  return VIEW_PATTERN.test(view);
}

function endpoint(view: string): string {
  return `/api/v1/view-state/${view}`;
}

/**
 * Read the durable state for a view, seeding the merge cache.
 * Returns {} when nothing has been stored (or the request fails).
 */
export async function fetchViewState<T extends ViewRecord = ViewRecord>(
  view: string,
): Promise<Partial<T>> {
  if (!valid(view)) return {};
  if (__IS_PREVIEW__) return (cache.get(view) ?? {}) as Partial<T>;
  try {
    const data = await api<ViewRecord>(endpoint(view));
    const record = data && typeof data === "object" ? data : {};
    cache.set(view, record);
    return record as Partial<T>;
  } catch {
    // A failed read must not wipe the merge base.
    return (cache.get(view) ?? {}) as Partial<T>;
  }
}

/**
 * Merge a changed-keys patch onto the stored object and flush it (debounced)
 * to the backend. Multiple calls within the window coalesce into one PUT.
 */
export function saveViewState(view: string, patch: ViewRecord, delay = 500): void {
  if (!valid(view)) return;
  pending.set(view, { ...(pending.get(view) ?? {}), ...patch });
  const existing = timers.get(view);
  if (existing) clearTimeout(existing);
  timers.set(
    view,
    setTimeout(() => {
      void flushViewState(view);
    }, delay),
  );
}

async function flushViewState(view: string): Promise<void> {
  timers.delete(view);
  const patch = pending.get(view);
  pending.delete(view);
  if (!patch) return;
  const base = cache.get(view) ?? (await fetchViewState(view));
  const merged: ViewRecord = { ...base, ...patch, ts: Math.floor(Date.now() / 1000) };
  cache.set(view, merged);
  if (__IS_PREVIEW__) return;
  try {
    await api(endpoint(view), { method: "PUT", body: merged });
  } catch {
    /* best-effort — the session still holds this state */
  }
}

/** Forget a view's durable state (optional "reset this page"). */
export async function clearViewState(view: string): Promise<void> {
  if (!valid(view)) return;
  const timer = timers.get(view);
  if (timer) clearTimeout(timer);
  timers.delete(view);
  pending.delete(view);
  cache.set(view, {});
  if (__IS_PREVIEW__) return;
  try {
    await api(endpoint(view), { method: "DELETE" });
  } catch {
    /* best-effort */
  }
}