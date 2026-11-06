import { listMatches } from "@/lib/jobs";

let cache: Map<string, number> | null = null;
let inflight: Promise<Map<string, number>> | null = null;

/**
 * A job-id → fit-score map sourced from the matches pool. The Saved jobs and
 * Search results lists cross-reference this so a role that also appears in
 * Matches wears the same fit band (spine color + label) everywhere it shows.
 *
 * Cached for the session; resolves to an empty map if the pool can't be read,
 * so callers can always fall back to a neutral "no score" treatment.
 */
export function getMatchScoreMap(): Promise<Map<string, number>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = listMatches()
    .then((list) => {
      const map = new Map<string, number>();
      for (const m of list ?? []) {
        if (typeof m.score === "number") map.set(String(m.job_id), m.score);
      }
      cache = map;
      return map;
    })
    .catch(() => {
      const empty = new Map<string, number>();
      cache = empty;
      return empty;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cached snapshot (e.g. after a fresh search run produces new matches). */
export function resetMatchScoreMap() {
  cache = null;
  inflight = null;
}