import { useCallback, useEffect, useRef, useState } from "react";
import {
  readPaneLayout,
  writePaneLayout,
  type PaneMode,
  type PanePreset,
} from "@/lib/previewLayoutMemory";

/** Matches the row's gap-6. */
const ROW_GAP = 24;
/** Never let the document pane get narrower than this. */
const MIN_DOC_WIDTH = 340;
/** Keep at least this much room for the side panels so they never collapse. */
const MIN_PANELS_WIDTH = 320;
const FALLBACK_MAX = 1400;

/**
 * Manages the resizable document-pane split for a document editor:
 * the Fit / 50% / 75% presets, a custom dragged width, and persistence so the
 * same document reopens with the layout the user left it in.
 */
export function useDocumentPreviewLayout(memoryKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<PaneMode>(
    () => readPaneLayout(memoryKey)?.preset ?? "fit"
  );
  const [width, setWidth] = useState<number | null>(() => {
    const stored = readPaneLayout(memoryKey);
    return stored && stored.preset !== "fit" ? stored.px : null;
  });

  /** Clamp a desired document-pane width so the panels keep their minimum. */
  const clampDocWidth = useCallback((px: number) => {
    const cw = containerRef.current?.offsetWidth ?? 0;
    const max = cw
      ? Math.max(MIN_DOC_WIDTH, cw - ROW_GAP - MIN_PANELS_WIDTH)
      : FALLBACK_MAX;
    return Math.min(max, Math.max(MIN_DOC_WIDTH, Math.round(px)));
  }, []);

  /** Apply a Fit / 50% / 75% preset (Fit = the flexible default split). */
  const applyPreset = useCallback(
    (preset: PanePreset) => {
      if (preset === "fit") {
        setMode("fit");
        setWidth(null);
        return;
      }
      const cw = containerRef.current?.offsetWidth ?? 0;
      const fraction = preset === "50" ? 0.5 : 0.75;
      setMode(preset);
      setWidth(cw ? clampDocWidth(cw * fraction) : null);
    },
    [clampDocWidth]
  );

  /** Record a custom width from a drag-to-resize. */
  const onResize = useCallback(
    (px: number) => {
      setMode("custom");
      setWidth(clampDocWidth(px));
    },
    [clampDocWidth]
  );

  // Keep a percentage preset proportional when the row width changes.
  useEffect(() => {
    if (mode !== "50" && mode !== "75") return;
    const recompute = () => {
      const el = containerRef.current;
      if (!el || el.offsetWidth === 0) return;
      const fraction = mode === "50" ? 0.5 : 0.75;
      setWidth(clampDocWidth(el.offsetWidth * fraction));
    };
    const raf = requestAnimationFrame(recompute);
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", recompute);
    };
  }, [mode, clampDocWidth]);

  // Remember the choice so a reopened document restores the same split.
  useEffect(() => {
    if (!memoryKey) return;
    writePaneLayout(memoryKey, { preset: mode, px: mode === "fit" ? null : width });
  }, [memoryKey, mode, width]);

  return { containerRef, mode, previewWidth: width, applyPreset, onResize };
}