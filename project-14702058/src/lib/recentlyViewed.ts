import { api } from "./api";

/**
 * Cross-device "recently viewed" rail.
 *
 * Contract:
 *   GET    /api/v1/recently-viewed?limit=12 → the rail (most-recent first)
 *   POST   /api/v1/recently-viewed          → record one open, returns the refreshed rail
 *   DELETE /api/v1/recently-viewed          → clear the whole history ("Clear")
 *
 * Entries are small: a kind, the referenced id, a display title/subtitle, and
 * the view whose selectedId should be restored when the card is opened. Nothing
 * but ids + labels is stored.
 */

export type RecentlyViewedKind = "resume" | "match" | "cover_letter" | "application";

export interface RecentlyViewedEntry {
  kind: RecentlyViewedKind;
  /** The id of the opened thing (résumé id / job id / cover-letter id / application id). */
  ref_id: string | number;
  /** Display title for the card. */
  title: string;
  /** Company / grade / status, shown under the title. */
  subtitle?: string;
  /** The view-state name to restore a selection in, e.g. "resumes" | "matches". */
  view: string;
  /**
   * For an application opened via its job link: the job posting id, so the card
   * can reopen the job detail the user was actually reading.
   */
  ref_job_id?: string | number;
  /**
   * For a "match" recorded by expanding an application card in place: the
   * application id, so the card can route back to the Applications board and
   * re-expand (and scroll to) the same card.
   */
  ref_application_id?: string | number;
  ts?: number;
}

export interface RecordRecentlyViewedInput {
  kind: RecentlyViewedKind;
  ref_id: string | number;
  title: string;
  subtitle?: string;
  view: string;
  ref_job_id?: string | number;
  ref_application_id?: string | number;
}

const KINDS: RecentlyViewedKind[] = ["resume", "match", "cover_letter", "application"];
/**
 * The rail loads alongside the dashboard — it must never stall the home screen.
 * A request that doesn't return in time is abandoned (resolving to the same
 * empty/best-effort result as a failure), so a blocked preflight can't leave the
 * dashboard waiting on it.
 */
const RAIL_TIMEOUT_MS = 15000;
/** Session-only set of entries whose ref_id 404'd — the rail drops those cards. */
const DROPPED_KEY = "hw_recently_viewed_dropped";

function entryKey(kind: string, refId: string | number): string {
  return `${kind}:${refId}`;
}

function readDropped(): string[] {
  try {
    const raw = sessionStorage.getItem(DROPPED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Mark an entry stale for this tab after its ref_id 404'd on open. The rail
 * filters it out so a deleted document never shows as a dead card.
 */
export function dropRecentlyViewedEntry(
  kind: RecentlyViewedKind,
  refId: string | number,
): void {
  try {
    const next = Array.from(new Set([...readDropped(), entryKey(kind, refId)]));
    sessionStorage.setItem(DROPPED_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable — the stale card simply reappears */
  }
}

function isDropped(kind: string, refId: string | number): boolean {
  return readDropped().includes(entryKey(kind, refId));
}

function isEntry(value: unknown): value is RecentlyViewedEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    (KINDS as string[]).includes(v.kind) &&
    v.ref_id !== undefined &&
    v.ref_id !== null
  );
}

/** Accept either a bare array or a wrapped list ({items}/{entries}/…). */
function coerceList(data: unknown): RecentlyViewedEntry[] {
  let list: unknown = data;
  if (data && !Array.isArray(data) && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    list =
      obj.items ??
      obj.entries ??
      obj.recently_viewed ??
      obj.recentlyViewed ??
      obj.results ??
      [];
  }
  if (!Array.isArray(list)) return [];
  return list.filter(isEntry);
}

/** Drop stale (404'd) cards and de-duplicate by kind + ref_id, keeping most-recent first. */
function clean(entries: RecentlyViewedEntry[]): RecentlyViewedEntry[] {
  const seen = new Set<string>();
  const out: RecentlyViewedEntry[] = [];
  for (const e of entries) {
    const key = entryKey(e.kind, e.ref_id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isDropped(e.kind, e.ref_id)) continue;
    out.push(e);
  }
  return out;
}

/** Read the rail (most-recent first). Returns [] on any failure. */
export async function listRecentlyViewed(limit = 12): Promise<RecentlyViewedEntry[]> {
  if (__IS_PREVIEW__) return [];
  try {
    const data = await api<unknown>(`/api/v1/recently-viewed?limit=${limit}`, {
      timeoutMs: RAIL_TIMEOUT_MS,
    });
    return clean(coerceList(data));
  } catch {
    return [];
  }
}

/** Record a single open. Best-effort — resolves to [] if the call fails. */
export function recordRecentlyViewed(
  input: RecordRecentlyViewedInput,
): Promise<RecentlyViewedEntry[]> {
  if (__IS_PREVIEW__) return Promise.resolve([]);
  return api<unknown>("/api/v1/recently-viewed", {
    method: "POST",
    body: input,
    timeoutMs: RAIL_TIMEOUT_MS,
  })
    .then((data) => clean(coerceList(data)))
    .catch(() => []);
}

/** Forget the whole recently-viewed history. */
export async function clearRecentlyViewed(): Promise<void> {
  if (__IS_PREVIEW__) return;
  try {
    await api("/api/v1/recently-viewed", { method: "DELETE", timeoutMs: RAIL_TIMEOUT_MS });
  } catch {
    /* best-effort — the rail is hidden locally anyway */
  }
}

/** Where a rail card should navigate. */
export function recentlyViewedPath(entry: RecentlyViewedEntry): string {
  // A card expanded on the Applications board comes back to the board itself.
  if (entry.ref_application_id != null) return "/dashboard/applications";
  switch (entry.kind) {
    case "resume":
      return `/dashboard/documents/resumes/${entry.ref_id}`;
    case "cover_letter":
      return `/dashboard/documents/cover-letters/${entry.ref_id}`;
    case "application":
      return entry.ref_job_id != null
        ? `/dashboard/jobs/${entry.ref_job_id}`
        : "/dashboard/applications";
    case "match":
    default:
      return `/dashboard/jobs/${entry.ref_id}`;
  }
}

/** The view-state name whose selectedId should be restored for an entry. */
export function recentlyViewedTargetView(entry: RecentlyViewedEntry): string {
  if (entry.ref_application_id != null) return "applications";
  if (entry.view) return entry.view;
  switch (entry.kind) {
    case "resume":
      return "resumes";
    case "cover_letter":
      return "cover-letters";
    case "application":
    case "match":
    default:
      return "matches";
  }
}

/** The id the target view should treat as "selected"/open. */
export function recentlyViewedTargetId(entry: RecentlyViewedEntry): string | number {
  if (entry.ref_application_id != null) return entry.ref_application_id;
  if (entry.kind === "application" && entry.ref_job_id != null) return entry.ref_job_id;
  return entry.ref_id;
}