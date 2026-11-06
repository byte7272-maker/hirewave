/**
 * Shared tuning for the version/document rails' pointer-glide.
 *
 * The glide eases a rail left or right while the pointer rests on a nav arrow or
 * near a rail edge. Speed is expressed in PIXELS PER SECOND and applied against
 * the real frame delta, so it feels identical on a 60Hz laptop and a 120Hz
 * monitor — a fixed "pixels per frame" value silently doubles on high-refresh
 * displays and reads as a lurch.
 *
 * The motion is enveloped so it never snaps to full speed or stops dead:
 *  - a soft SPIN-UP eases the rail up from a standstill over ~300ms on hover;
 *  - a gentle EASE-OUT settles the rail to a stop when the pointer leaves.
 * Both use the same smooth 0→1 curve (`glideEase`), applied as a velocity
 * envelope, so there's no visible kick at either end of the motion.
 *
 * A short rail (two or three cards) eases slowly for fine control; a long rail
 * (many versions or documents) moves quicker so you're not waiting ages to cross
 * it. The speed is derived from the rail's own overflow width, then clamped to a
 * comfortable band and scaled by the user's Slow / Medium / Fast preference.
 */

/** The user's remembered glide pace — Slow, Medium, or Fast. */
export type GlideSpeedPref = "slow" | "medium" | "fast";

/** Slowest comfortable glide — a short rail with barely anything to cross. */
const GLIDE_MIN_PX_PER_SEC = 200;
/** Fastest the glide ever gets, so a very long rail never feels like a jump. */
const GLIDE_MAX_PX_PER_SEC = 600;
/** Fraction of the total overflow crossed per second (bigger data sets → quicker). */
const GLIDE_OVERFLOW_FACTOR = 0.3;
/**
 * Biggest frame gap we'll honour, in ms. Clamping catches a stalled frame / tab
 * switch so the rail never teleports when the animation resumes.
 */
const GLIDE_MAX_FRAME_MS = 64;
/** How long the glide takes to ease UP from standstill to full speed, in ms. */
export const GLIDE_SPINUP_MS = 300;
/** How long the glide takes to ease OUT to a stop after the pointer leaves, in ms. */
export const GLIDE_SETTLE_MS = 280;

/** Multiplier applied to the data-aware base speed, per preference. */
const GLIDE_PREF_FACTOR: Record<GlideSpeedPref, number> = {
  slow: 0.6,
  medium: 1,
  fast: 1.6,
};

/** The preference choices, in display order, for the settings control. */
export const GLIDE_SPEED_OPTIONS: { value: GlideSpeedPref; label: string; hint: string }[] = [
  { value: "slow", label: "Slow", hint: "A gentle, precise glide for fine control" },
  { value: "medium", label: "Medium", hint: "The balanced default pace" },
  { value: "fast", label: "Fast", hint: "A quicker glide that crosses long rails sooner" },
];

/**
 * Pick a glide speed (px/second) for a rail. A short rail eases slowly for
 * control; a long one moves quicker so a big set is still crossable in a
 * reasonable time. Derived from the rail's own overflow width, then clamped to a
 * comfortable band and scaled by the user's preference.
 */
export function glideSpeedPxPerSec(
  rail: HTMLElement | null,
  pref: GlideSpeedPref = "medium"
): number {
  const factor = GLIDE_PREF_FACTOR[pref] ?? 1;
  if (!rail) return GLIDE_MIN_PX_PER_SEC * factor;
  const overflow = rail.scrollWidth - rail.clientWidth;
  const base =
    !Number.isFinite(overflow) || overflow <= 0
      ? GLIDE_MIN_PX_PER_SEC
      : Math.min(GLIDE_MAX_PX_PER_SEC, Math.max(GLIDE_MIN_PX_PER_SEC, overflow * GLIDE_OVERFLOW_FACTOR));
  return base * factor;
}

/**
 * Distance to travel this frame, given the previous frame's timestamp. Honours
 * the real elapsed time (clamped) so the glide keeps a steady on-screen pace
 * regardless of the display's refresh rate.
 */
export function glideFrameDelta(prevTimestamp: number, nowTimestamp: number): number {
  const dtMs = Math.min(GLIDE_MAX_FRAME_MS, Math.max(0, nowTimestamp - prevTimestamp));
  return dtMs / 1000;
}

/**
 * A smooth 0→1 curve (smoothstep) with ZERO velocity at both ends. Used as the
 * velocity envelope: applied directly it spins the rail up gently from rest;
 * applied inverted it eases the rail to a gentle stop — no kick at either end.
 */
export function glideEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}