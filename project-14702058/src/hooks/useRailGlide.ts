import { useEffect, useMemo, useRef, type MouseEvent, type RefObject } from "react";
import {
  GLIDE_SETTLE_MS,
  GLIDE_SPINUP_MS,
  glideEase,
  glideFrameDelta,
  glideSpeedPxPerSec,
} from "@/lib/railGlide";
import { readGlideSpeedPref } from "@/lib/railGlideMemory";

interface UseRailGlideOptions {
  /** The horizontally-scrolling rail. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The wrapper used to read the pointer's distance from either edge. */
  wrapRef?: RefObject<HTMLElement | null>;
  /** Distance from an edge (px) at which the edge-band glide kicks in. */
  edgeThreshold?: number;
}

/** What the shared glide hands back to a rail. */
export interface RailGlideHandle {
  /** Pointer entered an arrow — spin the glide up in that direction. */
  hoverArrow: (dir: -1 | 1) => void;
  /** Pointer left an arrow — ease the glide out into place. */
  releaseArrow: () => void;
  /** Edge-band pointer handler; attach to the rail's wrapper. */
  handlePointerMove: (e: MouseEvent<HTMLElement>) => void;
  /** True on touch / no-hover devices, where a tap steps instead of gliding. */
  touchDevice: boolean;
}

/**
 * The shared pointer-glide for the version / document rails.
 *
 * Hovering an arrow eases the rail up to a data-aware speed (a soft spin-up over
 * ~300ms, never a jump to full speed). Leaving eases it back down to a gentle
 * stop (~280ms) instead of halting dead. Both ends share one smooth velocity
 * envelope, so there's no kick. Scroll-snap is suspended for the duration of the
 * glide (with `snap-x` on, each programmatic nudge is yanked back to the nearest
 * card and the glide nets out to nothing) and restored once it settles, so the
 * rail still lands neatly on a card.
 *
 * The speed also honours the user's Slow / Medium / Fast preference, read fresh
 * each time a glide starts. All motion state lives in refs, so re-renders never
 * interrupt a glide in progress.
 */
export function useRailGlide({
  scrollRef,
  wrapRef,
  edgeThreshold = 72,
}: UseRailGlideOptions): RailGlideHandle {
  /** The pending animation frame (null when idle). */
  const rafRef = useRef<number | null>(null);
  /** The direction currently being glided (0 = none). */
  const dirRef = useRef<0 | -1 | 1>(0);
  /** True while the pointer rests on an arrow (that arrow owns the glide). */
  const arrowHover = useRef(false);
  /** Current signed velocity in px/second. */
  const speedRef = useRef(0);
  /** Which phase of the envelope we're in. */
  const phaseRef = useRef<"idle" | "run" | "settle">("idle");
  /** When the current phase began (ms). */
  const phaseStartRef = useRef(0);
  /** Velocity captured at the phase transition, so the curve starts from it. */
  const startSpeedRef = useRef(0);
  /** The data-aware target speed for the current direction (px/second). */
  const baseSpeedRef = useRef(0);
  /** Timestamp of the previous frame. */
  const lastRef = useRef(0);

  const touchDevice = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches,
    []
  );

  /** Re-arm scroll snapping after a glide finishes. */
  function restoreSnap() {
    const el = scrollRef.current;
    if (el) el.style.scrollSnapType = "";
  }

  /** End the glide entirely — cancel the frame and put snapping back. */
  function finish() {
    phaseRef.current = "idle";
    dirRef.current = 0;
    speedRef.current = 0;
    restoreSnap();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  /** Hand the glide over to its ease-out settle, from whatever speed it has now. */
  function beginSettle(now: number) {
    phaseRef.current = "settle";
    phaseStartRef.current = now;
    startSpeedRef.current = speedRef.current;
  }

  /** One frame of the envelope + travel. */
  function frame(now: number) {
    const node = scrollRef.current;
    if (!node) {
      finish();
      return;
    }
    const dt = glideFrameDelta(lastRef.current, now);
    lastRef.current = now;

    const phase = phaseRef.current;
    const dir = dirRef.current;

    // Reached an end while running: don't stop dead — ease out from here.
    if (phase === "run") {
      const atEnd =
        dir === -1
          ? node.scrollLeft <= 0
          : node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
      if (atEnd) {
        beginSettle(now);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
    }

    // Ease the velocity from where the phase began toward its target: full speed
    // while running, zero while settling. The shared curve has zero velocity at
    // both ends, so the rail never kicks off or stops abruptly.
    const dur = phase === "run" ? GLIDE_SPINUP_MS : GLIDE_SETTLE_MS;
    const progress = dur <= 0 ? 1 : Math.min(1, (now - phaseStartRef.current) / dur);
    const eased = glideEase(progress);
    const target = phase === "run" ? dir * baseSpeedRef.current : 0;
    speedRef.current = startSpeedRef.current + (target - startSpeedRef.current) * eased;

    if (phase === "run" || Math.abs(speedRef.current) > 0.02) {
      node.scrollLeft += speedRef.current * dt;
    }

    // Fully settled — stop the loop and re-arm snapping.
    if (phase === "settle" && progress >= 1) {
      finish();
      return;
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  /** Start (or redirect) the glide toward a direction. */
  function startGlide(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    // Already running this exact direction — leave the loop alone.
    if (phaseRef.current === "run" && dirRef.current === dir) return;
    // Suspend scroll-snap so the glide can actually move the rail; `snap-x` would
    // otherwise yank every nudge back to the nearest card and the glide would net
    // out to nothing.
    el.style.scrollSnapType = "none";
    const now = performance.now();
    // Spin up from whatever speed we currently hold (0 when standing still).
    startSpeedRef.current = speedRef.current;
    baseSpeedRef.current = glideSpeedPxPerSec(el, readGlideSpeedPref());
    dirRef.current = dir;
    phaseRef.current = "run";
    phaseStartRef.current = now;
    lastRef.current = now;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }

  /** Release the glide — it eases out rather than stopping instantly. */
  function stopGlide() {
    if (phaseRef.current === "idle") return;
    // Already easing out — let it finish rather than re-triggering.
    if (phaseRef.current === "settle") return;
    beginSettle(performance.now());
  }

  /** Pointer entered an arrow: mark it as the owner and spin the glide up. */
  function hoverArrow(dir: -1 | 1) {
    if (touchDevice) return;
    arrowHover.current = true;
    startGlide(dir);
  }

  /** Pointer left an arrow: release ownership and ease the glide out. */
  function releaseArrow() {
    arrowHover.current = false;
    stopGlide();
  }

  /** Resting near either edge glides that way; leaving the band eases it out. */
  function handlePointerMove(e: MouseEvent<HTMLElement>) {
    // Touch devices have no hover to glide with, and a tap's simulated pointer
    // events near an edge must not kick off a glide — taps step one card only.
    if (touchDevice) return;
    // While the pointer rests on an arrow, that arrow owns the glide.
    if (arrowHover.current) return;
    const wrap = wrapRef?.current;
    const el = scrollRef.current;
    if (!wrap || !el) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const canLeft = el.scrollLeft > 1;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (x < edgeThreshold && canLeft) startGlide(-1);
    else if (x > rect.width - edgeThreshold && canRight) startGlide(1);
    else stopGlide();
  }

  // Never leave a frame running (or snapping suspended) behind a closed rail.
  useEffect(() => {
    const raf = rafRef;
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      const el = scrollRef.current;
      if (el) el.style.scrollSnapType = "";
    };
  }, [scrollRef]);

  return { hoverArrow, releaseArrow, handlePointerMove, touchDevice };
}