import { useCallback, useEffect, useRef, useState } from "react";
import { readViewerZoom, writeViewerZoom } from "@/lib/viewerZoomMemory";
import type { ViewerZoomMode } from "@/lib/viewerZoomMemory";

/**
 * Click-stops for the zoom controls, in the order they are stepped through: a
 * plain 10% ladder from 50% to 200%, matching the Document pane and the template
 * preview so every viewer in the app zooms in the same, predictable increments.
 */
export const ZOOM_STEPS = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2,
];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/**
 * The quick-jump scales offered by the toolbar's preset menu — the common stops
 * between 50% and 200%, so a specific size is one click away instead of many
 * taps of the + / − click-stops.
 */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * The zoom a document opens on when it has NO remembered choice of its own — i.e.
 * a freshly created résumé or cover letter. It is Fit page, so a new document
 * lands with the WHOLE page in view first rather than a scrolled column.
 */
export const DEFAULT_VIEWER_ZOOM_MODE: ViewerZoomMode = "page";

interface UseVersionZoomOptions {
  /**
   * Per-document memory key (e.g. `resume:42`). Pass an empty string for a
   * transient surface that shouldn't persist (the full-size lightbox).
   */
  memoryKey: string;
  /** The page's natural width (A4 paper width), for the Fit-width scale. */
  pageWidth: number;
  /** The scroll/fit stage width (px), so Fit width & the % readout are accurate. */
  stageW: number;
  /** Whether the choice is remembered for this key. Off for transient surfaces. */
  persist?: boolean;
  /** The mode used when nothing is remembered. Defaults to Fit page. */
  defaultMode?: ViewerZoomMode;
  /** Whether the keyboard shortcuts are bound. */
  enabled?: boolean;
  /**
   * When true (the default) the shortcuts stand down while a readable modal is
   * open (it locks body scroll) so an overlay on top owns the keys instead. The
   * overlay's own viewer passes `false` so it keeps control.
   */
  respectOverlayLock?: boolean;
}

export interface VersionZoom {
  /** Which fit the viewer uses, or a fixed percentage when `"custom"`. */
  mode: ViewerZoomMode;
  /** The fixed zoom when `mode` is `"custom"` (1 = actual size). */
  zoom: number;
  /** The scale actually in effect, once the measured fit modes are resolved. */
  effectiveScale: number;
  /** The honest percentage to show in the toolbar. */
  zoomPercent: number;
  /** True when zoomed out to the smallest click-stop. */
  atMin: boolean;
  /** True when zoomed in to the largest click-stop. */
  atMax: boolean;
  /** True when showing the page at actual size (100% as a fixed zoom). */
  isActualSize: boolean;
  /** Switch mode directly (Fit page / Fit width). */
  setMode: (mode: ViewerZoomMode) => void;
  /** Snap to actual size (100%). */
  setActualSize: () => void;
  /** Jump straight to an exact percentage (e.g. 115), leaving any fit mode. */
  setZoomPercent: (percent: number) => void;
  /** Step to the next / previous zoom stop, leaving a fit mode if we were in one. */
  step: (dir: -1 | 1) => void;
  /** The measured scale the preview landed on, for a truthful Fit-page readout. */
  reportScale: (scale: number) => void;
  /** Flip between Fit page and Fit width (the F shortcut's action). */
  toggleFit: () => void;
}

/**
 * The shared zoom model behind the MAIN document viewer AND the full-size
 * lightbox: Fit page / Fit width / 100% (or a stepped %), remembered per document,
 * with the Cmd/Ctrl + / − / 0 click-stops and the F flip between Fit page and Fit
 * width. Kept in one place so both surfaces behave identically.
 */
export default function useVersionZoom({
  memoryKey,
  pageWidth,
  stageW,
  persist = true,
  defaultMode = DEFAULT_VIEWER_ZOOM_MODE,
  enabled = true,
  respectOverlayLock = true,
}: UseVersionZoomOptions): VersionZoom {
  const [mode, setMode] = useState<ViewerZoomMode>(
    () => readViewerZoom(memoryKey)?.mode ?? defaultMode
  );
  const [zoom, setZoom] = useState<number>(
    () => readViewerZoom(memoryKey)?.zoom ?? 1
  );
  /** The scale the preview actually landed on, for a truthful % readout. */
  const [reportedScale, setReportedScale] = useState<number | null>(null);
  /** The document the current zoom belongs to, so a doc switch adopts its own. */
  const keyRef = useRef(memoryKey);

  // Switching to another document adopts that document's own remembered zoom.
  useEffect(() => {
    if (keyRef.current === memoryKey) return;
    keyRef.current = memoryKey;
    const saved = readViewerZoom(memoryKey);
    setMode(saved ? saved.mode : defaultMode);
    setZoom(saved ? saved.zoom : 1);
    setReportedScale(null);
  }, [memoryKey, defaultMode]);

  // Remember the current document's zoom so a reload / revisit restores it.
  useEffect(() => {
    if (!persist || !memoryKey) return;
    writeViewerZoom(memoryKey, { mode, zoom });
  }, [persist, memoryKey, mode, zoom]);

  const fitWidthScale = Math.min(1, stageW / pageWidth);
  const effectiveScale =
    mode === "width"
      ? fitWidthScale
      : mode === "page"
        ? reportedScale ?? fitWidthScale
        : zoom;
  const zoomPercent = Math.max(10, Math.round(effectiveScale * 100));
  const atMin = mode === "custom" && zoom <= MIN_ZOOM + 0.001;
  const atMax = mode === "custom" && zoom >= MAX_ZOOM - 0.001;
  const isActualSize = mode === "custom" && Math.abs(zoom - 1) < 0.001;

  const reportScale = useCallback((scale: number) => setReportedScale(scale), []);

  const setActualSize = useCallback(() => {
    setMode("custom");
    setZoom(1);
  }, []);

  /** Jump to an exact percentage, clamped to the supported range. */
  const setZoomPercent = useCallback((percent: number) => {
    if (!Number.isFinite(percent)) return;
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent / 100));
    setMode("custom");
    setZoom(value);
  }, []);

  /** Step to the next / previous stop, leaving a fit mode if we were in one. */
  const step = useCallback(
    (dir: -1 | 1) => {
      let next = effectiveScale;
      if (dir === 1) {
        next = ZOOM_STEPS.find((s) => s > effectiveScale + 0.001) ?? MAX_ZOOM;
      } else {
        const lower = ZOOM_STEPS.filter((s) => s < effectiveScale - 0.001);
        next = lower.length ? lower[lower.length - 1] : MIN_ZOOM;
      }
      setMode("custom");
      setZoom(next);
    },
    [effectiveScale]
  );

  /** F flips between Fit page and Fit width; anything else lands on Fit page. */
  const toggleFit = useCallback(() => {
    setMode((current) => (current === "page" ? "width" : "page"));
  }, []);

  // Cmd/Ctrl + / − / 0 for the click-stops, and F to flip Fit page ↔ Fit width.
  // Ignored while the caret is in a field so typing is never hijacked, and (by
  // default) while a readable overlay is open so the top surface owns the keys.
  useEffect(() => {
    if (!enabled) return undefined;
    function onKey(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (respectOverlayLock && document.body.style.overflow === "hidden") return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          step(1);
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          step(-1);
        } else if (event.key === "0") {
          event.preventDefault();
          setActualSize();
        }
        return;
      }
      if (mod || event.altKey) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, respectOverlayLock, step, setActualSize, toggleFit]);

  return {
    mode,
    zoom,
    effectiveScale,
    zoomPercent,
    atMin,
    atMax,
    isActualSize,
    setMode,
    setActualSize,
    setZoomPercent,
    step,
    reportScale,
    toggleFit,
  };
}