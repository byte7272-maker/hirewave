import { api, ApiError } from "./api";

/**
 * Account-scoped "Improve with AI" memory.
 *
 * The improve picks (selected chips, the custom instruction, ticked review
 * findings, and the last run) used to live only in this browser's localStorage.
 * This module mirrors the read-aloud preference pattern (`narration.ts`): the
 * picks are loaded from and saved to the signed-in user's account, so they
 * follow the user across devices. localStorage stays as the instant cache and
 * as the offline fallback when the backend copy isn't reachable.
 */

/** The exact combo (chips + instruction + findings) of a single improve run. */
export interface ImproveLastRun {
  prompts: string[];
  instruction: string;
  findings: string[];
}

/** Everything remembered for one document. */
export interface ImprovePicks {
  prompts: string[];
  instruction: string;
  findings: string[];
  /** The last improve run, offered as a one-click "Reuse last improve". */
  last?: ImproveLastRun | null;
}

/** The account's picks keyed by an opaque document key (e.g. `hirewave_improve:42`). */
export type ImprovePicksMap = Record<string, ImprovePicks>;

// Module-level cache so every panel shares one fetch instead of each firing a
// duplicate GET /users/me/improve-picks request.
let cache: ImprovePicksMap | null = null;
let inflight: Promise<ImprovePicksMap> | null = null;
/**
 * Set once the account endpoint answers 404 (the backend doesn't expose it yet).
 * From then on this session makes NO more improve-picks requests at all and falls
 * back cleanly to localStorage — so a missing endpoint never spams the network or
 * the console. Flip the endpoint on and this self-heals on the next page load.
 */
let accountSyncUnavailable = false;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function normalizeLast(value: unknown): ImproveLastRun | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const run: ImproveLastRun = {
    prompts: normalizeStringArray(rec.prompts),
    instruction: typeof rec.instruction === "string" ? rec.instruction : "",
    findings: normalizeStringArray(rec.findings),
  };
  if (!run.prompts.length && !run.findings.length && !run.instruction.trim()) return null;
  return run;
}

function normalizePicks(value: unknown): ImprovePicks {
  const rec = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    prompts: normalizeStringArray(rec.prompts),
    instruction: typeof rec.instruction === "string" ? rec.instruction : "",
    findings: normalizeStringArray(rec.findings),
    last: normalizeLast(rec.last),
  };
}

/** Tolerate the likely response shapes (a keyed map, or `{ picks: {...} }`). */
export function normalizeImprovePicksMap(raw: unknown): ImprovePicksMap {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const source =
    obj.picks && typeof obj.picks === "object"
      ? (obj.picks as Record<string, unknown>)
      : obj;
  const out: ImprovePicksMap = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = normalizePicks(value);
  }
  return out;
}

/** True once the account endpoint has answered 404 — skip further requests. */
export function isImprovePicksSyncUnavailable(): boolean {
  return accountSyncUnavailable;
}

/** Treat a 404 from the endpoint as "not available" — remember it for the session. */
function noteEndpointMissing(err: unknown): void {
  if (err instanceof ApiError && err.status === 404) accountSyncUnavailable = true;
}

/** Load the user's remembered improve picks (once per session, then cached). */
export function fetchImprovePicks(): Promise<ImprovePicksMap> {
  if (cache) return Promise.resolve(cache);
  // The endpoint isn't there yet — go straight to the local fallback, no request.
  if (accountSyncUnavailable) return Promise.resolve({});
  if (!inflight) {
    inflight = api<unknown>("/api/v1/users/me/improve-picks")
      .then((raw) => {
        cache = normalizeImprovePicksMap(raw);
        return cache;
      })
      .catch((err) => {
        // A 404 (endpoint not deployed) is expected — remember it and stop asking.
        noteEndpointMissing(err);
        return {} as ImprovePicksMap;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Upsert one document's picks on the account so they follow the user. */
export async function saveImprovePicks(key: string, picks: ImprovePicks): Promise<void> {
  if (cache) cache = { ...cache, [key]: picks };
  if (accountSyncUnavailable) return;
  try {
    await api("/api/v1/users/me/improve-picks", {
      method: "PUT",
      body: { key, ...picks },
    });
  } catch (err) {
    noteEndpointMissing(err);
    throw err;
  }
}

/** Forget one document's picks on the account. */
export async function clearImprovePicks(key: string): Promise<void> {
  if (cache) {
    const next = { ...cache };
    delete next[key];
    cache = next;
  }
  if (accountSyncUnavailable) return;
  try {
    await api(`/api/v1/users/me/improve-picks?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  } catch (err) {
    noteEndpointMissing(err);
    throw err;
  }
}