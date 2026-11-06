import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PAPER_WIDTH } from "./themes/paper";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const VIEWER_HEIGHT = 660;

interface TemplatePreviewProps {
  children: ReactNode;
  /** Bumping this scrolls the preview back to the top (e.g. when switching themes). */
  resetKey?: string;
  /**
   * Emit the print target (`#hw-print-root`). Set false for a secondary pane
   * (e.g. the "current version" side of a compare view) so printing still
   * targets exactly one paper.
   */
  printable?: boolean;
  /** Height (px) of the scroll frame. Defaults to 660; smaller fits a sticky pane. */
  viewerHeight?: number;
  /**
   * When set, the paper uses this font-family stack instead of the template's
   * built-in one (applied through the `--doc-font` variable + `.hw-doc-font`).
   */
  fontStack?: string;
  /**
   * When set, the preview gains a "Full view" button in its header and the paper
   * becomes click-to-expand, opening a full-screen readable view of the revision.
   */
  onExpand?: () => void;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

/**
 * A4-width scroll frame for a résumé theme. Uses the CSS `zoom` property so the
 * paper scales for layout (scrollbars stay correct) rather than a transform.
 */
export default function TemplatePreview({
  children,
  resetKey,
  printable = true,
  viewerHeight = VIEWER_HEIGHT,
  fontStack,
  onExpand,
}: TemplatePreviewProps) {
  const [zoom, setZoom] = useState(0.7);
  const [fit, setFit] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep "fit width" accurate as the frame resizes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !fit) return;
    const apply = () => setZoom(clampZoom(el.clientWidth / PAPER_WIDTH));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Jump back to the top when the theme (or data) changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  function zoomIn() {
    setFit(false);
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }
  function zoomOut() {
    setFit(false);
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  }
  function resetZoom() {
    setFit(false);
    setZoom(1);
  }
  function toggleFit() {
    if (fit) {
      setFit(false);
      setZoom(1);
    } else {
      setFit(true);
    }
  }

  return (
    <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-background-200 flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center rounded-md border border-background-200 bg-background-50 overflow-hidden">
          <button
            onClick={zoomOut}
            className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
            aria-label="Zoom out"
          >
            <i className="ri-zoom-out-line"></i>
          </button>
          <button
            onClick={resetZoom}
            className="h-8 px-2 text-xs font-semibold text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
            title="Reset to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
            aria-label="Zoom in"
          >
            <i className="ri-zoom-in-line"></i>
          </button>
        </div>
        <button
          onClick={toggleFit}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            fit
              ? "bg-accent-500 text-background-50 dark:text-foreground-950"
              : "text-foreground-600 hover:text-foreground-900 border border-background-200"
          }`}
        >
          <i className="ri-arrow-left-right-line"></i>
          Fit width
        </button>
        {onExpand && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 whitespace-nowrap">
            <i className="ri-external-link-line"></i>
            Click the page for a full readable view
          </span>
        )}
        {onExpand && (
          <button
            onClick={onExpand}
            title="Open this revision in a full-screen readable view"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-expand-diagonal-line"></i>
            Full view
          </button>
        )}
        <span className="ml-auto text-xs text-foreground-400">A4 · live preview</span>
      </div>

      <div ref={scrollRef} className="hw-print-scroll overflow-auto bg-background-100/40" style={{ height: viewerHeight }}>
        <div className="mx-auto py-6" style={{ width: PAPER_WIDTH }}>
          <div
            id={printable ? "hw-print-root" : undefined}
            style={{ zoom, ...(fontStack ? { "--doc-font": fontStack } : {}) } as CSSProperties}
            className={`mx-auto shadow-sm${printable ? " hw-print-paper" : ""}${
              fontStack ? " hw-doc-font" : ""
            }${onExpand ? " cursor-zoom-in" : ""}`}
            onClick={onExpand}
            role={onExpand ? "button" : undefined}
            tabIndex={onExpand ? 0 : undefined}
            title={onExpand ? "Open full readable view" : undefined}
            onKeyDown={
              onExpand
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onExpand();
                    }
                  }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}