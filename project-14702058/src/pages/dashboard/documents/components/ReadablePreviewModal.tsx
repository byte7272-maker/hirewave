import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { readReadableReview, writeReadableReview } from "@/lib/readableReviewMemory";
import RevisedHighlight from "./RevisedHighlight";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface FitPaneProps {
  /** Natural content width (px) — a paper is rendered at this width, then scaled to fit. */
  width?: number;
  /** Ref to the printable content node (the revision), so "Download as PDF" can clone it. */
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * Renders its children at a fixed natural width and scales them down to fit the
 * available space (via the CSS `zoom` property, which reflows rather than just
 * transforming). Fluid content (no width) renders at full width, unscaled.
 */
function FitPane({ width, contentRef, children }: FitPaneProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !width) {
      setZoom(1);
      return;
    }
    const apply = () => setZoom(Math.min(1, el.clientWidth / width));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={boxRef} className="w-full">
      <div
        style={{ zoom, width: width ?? "100%", margin: "0 auto" }}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Print a pane to PDF via the browser, isolating exactly that content.
 *
 * It reuses the app's existing print stylesheet (which reveals a single
 * `#hw-print-root` and hides everything else), so we clone the pane into a fresh
 * `#hw-print-root` at the end of `<body>` and stash the background one's id for
 * the duration of the print. The clone keeps every inline style, so the output
 * matches the on-screen paper exactly.
 */
function printNode(node: HTMLElement | null): void {
  if (!node) return;
  const existing = Array.from(
    document.querySelectorAll<HTMLElement>("#hw-print-root")
  );
  existing.forEach((el) => el.removeAttribute("id"));

  const clone = node.cloneNode(true) as HTMLElement;
  clone.setAttribute("id", "hw-print-root");
  clone.classList.add("hw-print-paper");
  clone.style.zoom = "1";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";

  const wrapper = document.createElement("div");
  wrapper.className = "hw-print-scroll";
  wrapper.style.width = "100%";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  window.print();

  document.body.removeChild(wrapper);
  existing.forEach((el) => el.setAttribute("id", "hw-print-root"));
}

interface ReadablePreviewModalProps {
  /** Heading shown at the top of the view. */
  title: string;
  /**
   * Optional node rendered in place of the plain title heading — lets a caller
   * swap the heading for an inline editor (e.g. a version nickname field).
   */
  titleNode?: ReactNode;
  /** Small line under the title (defaults to "Full readable view"). */
  subtitle?: ReactNode;
  /** Optional extra meta row under the title (e.g. a version's date + change summary). */
  meta?: ReactNode;
  /** Close handler (backdrop click, ✕ or Esc). */
  onClose: () => void;
  /** The revision — shown plain when highlighting is off. */
  revision: ReactNode;
  /** An optional pre-highlighted revision; used instead of term matching when set. */
  revisionHighlighted?: ReactNode;
  /** Passages the AI revised — highlighted (via term matching) when the toggle is on. */
  revisionHighlightTerms?: string[];
  revisionLabel?: string;
  /** Natural paper width for the revision pane (a template paper is 794px). */
  revisionWidth?: number;
  /** The current saved version — powers the A/B flip and the compare view. */
  comparison?: ReactNode | null;
  comparisonLabel?: string;
  /** Natural paper width for the comparison pane. */
  comparisonWidth?: number;
  /** Start in the split compare view. */
  initialCompare?: boolean;
  /**
   * Turn "Highlight changes" on by default (when nothing is remembered yet and
   * there are terms to highlight). Used by the "impact" view, whose whole point
   * is to show the highlighted passages.
   */
  defaultHighlight?: boolean;
  /** Footer hint text. */
  hint?: string;
  /**
   * Per-document key for remembering the review toggles (highlight / compare /
   * A-B side), so the view reopens exactly as it was left.
   */
  memoryKey?: string;
  /** Whether the revision carries AI-added figures — drives the amber legend. */
  hasFlaggedFigures?: boolean;
  /**
   * Optional action bar pinned to the bottom of the view (e.g. version actions
   * like "Make current" / rename / delete). Rendered above the hint line.
   */
  actions?: ReactNode;
  /**
   * Optional controls rendered in the always-visible header, beside the close
   * button (e.g. a primary "Open in full editor" action). Because the header sits
   * OUTSIDE the scroll region, these stay reachable no matter how far the document
   * is scrolled.
   */
  headerActions?: ReactNode;
  /**
   * Optional override for the "Download PDF" action. When provided it replaces the
   * default (which prints the revision DOM node) — used when the revision is an
   * iframe, whose contents the parent page cannot print.
   */
  onDownloadPdf?: () => void;
  /** Optional tooltip for the Download PDF button, to name what is being saved. */
  downloadTitle?: string;
  /**
   * When false, the revision is rendered WITHOUT the FitPane fit-width scaling, so
   * a self-scaling surface (e.g. a version reader that carries its own zoom
   * toolbar) owns its own size. Defaults to true — existing callers are unchanged.
   */
  fitRevision?: boolean;
  /**
   * When true, the review toolbar row (A/B flip / highlight / compare / PDF) is
   * hidden — used when the revision provides its own controls row.
   */
  hideToolbar?: boolean;
}

/**
 * Full-screen, distraction-free readable view of an UNSAVED revision (an
 * AI-improved résumé or cover letter). It renders already-produced content
 * instead of fetching a saved preview, and turns the paper into a proper review
 * surface:
 *
 *  - **A/B flip** — previous/next between the current saved version (A) and the
 *    improved revision (B), each at a readable size.
 *  - **Highlight changes** — a toggle that pens over exactly the passages the AI
 *    revised (off by default, so it starts as the normal, unmarked document).
 *  - **Compare** — the side-by-side split, inside the full-screen view.
 *  - **Download as PDF** — save the revision before accepting it.
 *
 * Esc / backdrop / ✕ close it, focus is trapped inside, and page scroll is locked
 * and restored on close.
 */
export default function ReadablePreviewModal({
  title,
  titleNode,
  subtitle = "Full readable view",
  meta,
  onClose,
  revision,
  revisionHighlighted,
  revisionHighlightTerms = [],
  revisionLabel = "Improved revision",
  revisionWidth,
  comparison = null,
  comparisonLabel = "Current version",
  comparisonWidth,
  initialCompare = false,
  defaultHighlight = false,
  hint,
  memoryKey = "",
  hasFlaggedFigures = false,
  actions,
  headerActions,
  onDownloadPdf,
  downloadTitle,
  fitRevision = true,
  hideToolbar = false,
}: ReadablePreviewModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef<HTMLDivElement>(null);

  const hasComparison = comparison !== null && comparison !== undefined;
  // Passages to pen over — when there are none, the highlight toggle is hidden
  // (a plain document, e.g. a live template preview, has nothing to highlight).
  const terms = revisionHighlightTerms.filter(Boolean);
  const canHighlight = Boolean(revisionHighlighted) || terms.length > 0;
  // Restore the last-used review toggles for this document (highlight / compare /
  // A-B side) so the view reopens the way it was left; falls back to defaults.
  const remembered = useMemo(
    () => (memoryKey ? readReadableReview(memoryKey) : null),
    [memoryKey]
  );
  const [side, setSide] = useState<"revision" | "comparison">(() =>
    hasComparison && remembered?.side === "comparison" ? "comparison" : "revision"
  );
  // Off by default — the readable view opens as the normal, unmarked document.
  // A remembered choice wins; otherwise the caller can ask for it on (impact view).
  const [highlight, setHighlight] = useState(() =>
    canHighlight ? Boolean(remembered ? remembered.highlight : defaultHighlight) : false
  );
  const [compare, setCompare] = useState(() => {
    const want = remembered?.compare ?? Boolean(initialCompare);
    return Boolean(want && hasComparison);
  });

  // Lock the page scroll behind the modal, then restore the exact position on close.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Remember the review toggles for this document so reopening restores them.
  useEffect(() => {
    if (!memoryKey) return;
    writeReadableReview(memoryKey, {
      highlight,
      compare: compare && hasComparison,
      side,
    });
  }, [memoryKey, highlight, compare, side, hasComparison]);

  // Trap focus inside the dialog, close on Esc, flip A/B with the arrow keys,
  // and restore the previous focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (event.key === "Escape") {
        // Let a focused field handle Escape itself (e.g. cancel an inline
        // nickname edit) instead of tearing down the whole view.
        if (typing) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (hasComparison && !compare && !typing) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setSide("comparison");
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setSide("revision");
          return;
        }
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose, hasComparison, compare]);

  /** Save the improved revision as a PDF (printing the revision pane, whatever is shown). */
  function handleDownloadPdf() {
    // A caller that supplies its own exporter (e.g. a saved version whose surface
    // is an iframe) always wins over the built-in print-the-node behaviour.
    if (onDownloadPdf) {
      onDownloadPdf();
      return;
    }
    if (side === "comparison" && !compare && hasComparison) {
      setSide("revision");
      window.requestAnimationFrame(() => printNode(revisionRef.current));
      return;
    }
    printNode(revisionRef.current);
  }

  const revisionBody =
    highlight && revisionHighlighted ? (
      revisionHighlighted
    ) : highlight && terms.length > 0 ? (
      <RevisedHighlight enabled terms={terms}>
        {revision}
      </RevisedHighlight>
    ) : (
      revision
    );

  const sideLabel = side === "comparison" ? comparisonLabel : revisionLabel;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-6">
      <div
        className="absolute inset-0 bg-foreground-950/50 dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — full readable view`}
        tabIndex={-1}
        className={`relative w-full h-full max-h-[94dvh] bg-background-50 rounded-2xl border border-background-200 overflow-hidden flex flex-col outline-none ${
          compare && hasComparison ? "max-w-[1360px]" : "max-w-[1000px]"
        }`}
      >
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
              <i className="ri-file-text-line"></i>
            </span>
            <div className="min-w-0">
              {titleNode ?? (
                <h2 className="font-heading text-base font-medium text-foreground-950 truncate">
                  {title}
                </h2>
              )}
              <span className="block text-xs text-foreground-500">{subtitle}</span>
              {meta}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-950 cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* Review toolbar — A/B flip, highlight, compare and PDF export. */}
        {!hideToolbar && (
        <div className="px-5 py-2.5 border-b border-background-200 flex items-center gap-2 flex-wrap flex-shrink-0 bg-background-50">
          {hasComparison && !compare && (
            <div className="inline-flex items-center rounded-md border border-background-200 bg-background-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setSide("comparison")}
                disabled={side === "comparison"}
                title={`Previous: ${comparisonLabel}`}
                aria-label={`Previous: ${comparisonLabel}`}
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>
              <span className="px-2.5 text-xs font-semibold text-foreground-800 max-w-[180px] truncate whitespace-nowrap">
                {sideLabel}
              </span>
              <button
                type="button"
                onClick={() => setSide("revision")}
                disabled={side === "revision"}
                title={`Next: ${revisionLabel}`}
                aria-label={`Next: ${revisionLabel}`}
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          )}

          {canHighlight && (
            <button
              type="button"
              onClick={() => setHighlight((v) => !v)}
              aria-pressed={highlight}
              title="Highlight the passages the AI revised"
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                highlight
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                  : "bg-background-50 text-foreground-700 border-background-200 hover:bg-background-100"
              }`}
            >
              <i className="ri-mark-pen-line"></i>
              Highlight changes
            </button>
          )}

          {hasComparison && (
            <button
              type="button"
              onClick={() => setCompare((v) => !v)}
              aria-pressed={compare}
              title="Show the current version and the improvement side by side"
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                compare
                  ? "bg-accent-500 text-background-50 dark:text-foreground-950 border-accent-500"
                  : "bg-background-50 text-foreground-700 border-background-200 hover:bg-background-100"
              }`}
            >
              <i className="ri-layout-column-line"></i>
              {compare ? "Split view" : "Compare"}
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadPdf}
            title={downloadTitle ?? "Save the improved revision as a PDF"}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-download-2-line"></i>
            Download PDF
          </button>
        </div>
        )}

        {/* Color legend — makes the two highlight colors self-explanatory. */}
        {(canHighlight && highlight) || hasFlaggedFigures ? (
          <div className="px-5 py-2 border-b border-background-200 bg-background-50 flex items-center gap-4 flex-wrap flex-shrink-0 hw-print-hide">
            {canHighlight && highlight && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-600 whitespace-nowrap">
                <span className="w-3.5 h-3.5 rounded-[3px] bg-primary-200 border-b-2 border-primary-500"></span>
                AI-revised passage
              </span>
            )}
            {hasFlaggedFigures && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-600 whitespace-nowrap">
                <span
                  className="w-3.5 h-3.5 rounded-[3px]"
                  style={{ background: "#fef08a", borderBottom: "2px solid #eab308" }}
                ></span>
                AI-added figure — verify
              </span>
            )}
          </div>
        ) : null}

        {compare && hasComparison ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
            <div className="min-h-0 overflow-auto doc-scroll bg-background-50 px-4 py-5 border-b lg:border-b-0 lg:border-r border-background-200">
              <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-500 hw-print-hide">
                <i className="ri-history-line"></i>
                {comparisonLabel}
              </div>
              <FitPane width={comparisonWidth}>{comparison}</FitPane>
            </div>
            <div className="min-h-0 overflow-auto doc-scroll bg-primary-50/40 px-4 py-5">
              <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hw-print-hide">
                <i className="ri-sparkling-line"></i>
                {revisionLabel}
              </div>
              <FitPane
                key={`rev-${highlight}`}
                width={revisionWidth}
                contentRef={revisionRef}
              >
                {revisionBody}
              </FitPane>
            </div>
          </div>
        ) : fitRevision ? (
          <div className="flex-1 min-h-0 overflow-auto doc-scroll bg-background-100/40 px-4 py-6">
            <FitPane
              key={`${side}-${highlight}`}
              width={side === "comparison" ? comparisonWidth : revisionWidth}
              contentRef={side === "revision" ? revisionRef : undefined}
            >
              {side === "comparison" && hasComparison ? comparison : revisionBody}
            </FitPane>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-background-100/40">{revisionBody}</div>
        )}

        {actions && (
          <div className="px-5 py-3 border-t border-background-200 flex items-center gap-2 flex-wrap flex-shrink-0 bg-background-50">
            {actions}
          </div>
        )}

        <div
          className={`px-5 py-2.5 ${
            actions ? "" : "border-t border-background-200"
          } text-[11px] text-foreground-400 text-center flex-shrink-0`}
        >
          {hint ??
            (hasComparison
              ? "Esc to close · ← / → to flip versions · scroll inside this view to keep reading"
              : "Press Esc to close · scroll inside this view to keep reading")}
        </div>
      </div>
    </div>,
    document.body
  );
}