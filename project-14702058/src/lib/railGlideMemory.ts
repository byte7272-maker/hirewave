/**
 * Remembers the user's preferred rail-glide pace (Slow / Medium / Fast) so the
 * version and document rails keep the same feel across sessions. This is a
 * global, client-only UI preference. Best-effort: storage failures are swallowed
 * and fall back to Medium.
 */

import type { GlideSpeedPref } from "./railGlide";

const STORAGE_KEY = "hirewave_rail_glide_speed";
const DEFAULT_PREF: GlideSpeedPref = "medium";

/** Type-guard a raw stored string into a known preference. */
function isPref(value: unknown): value is GlideSpeedPref {
  return value === "slow" || value === "medium" || value === "fast";
}

/** The remembered glide pace, defaulting to Medium when unset or unreadable. */
export function readGlideSpeedPref(): GlideSpeedPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isPref(raw) ? raw : DEFAULT_PREF;
  } catch {
    return DEFAULT_PREF;
  }
}

/** Persist the chosen glide pace. */
export function writeGlideSpeedPref(pref: GlideSpeedPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* Storage may be unavailable — the choice still applies for this session. */
  }
}