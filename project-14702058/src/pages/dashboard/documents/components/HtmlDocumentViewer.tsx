import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { ApiError, isNetworkError } from "@/lib/api";
import useInlineDocEdit from "@/hooks/useInlineDocEdit";
import type { InlineEditMeta } from "@/hooks/useInlineDocEdit";
import usePreviewPan from "./usePreviewPan";
import RephraseToolbar from "@/pages/dashboard/documents/components/RephraseToolbar";
import { ZOOM_PRESETS } from "./useVersionZoom";
import { injectSectionStyles, useSectionStyles } from "@/lib/sectionStyles";
import { applyPreviewHighlights, clearPreviewHighlights } from "@/lib/previewHighlight";
import {
  getCoverLetterPreviewHtml,
  getCoverLetterPreviewUrl,
  getResumePreviewHtml,
  getResumePreviewUrl,
} from "@/lib/documents";
import {
  readDocViewLayout,
  writeDocViewLayout,
} from "@/lib/previewLayoutMemory";
import {
  readRephraseInstruction,
  subscribeRephraseInstruction,
  type RememberedRephraseInstruction,
} from "@/lib/rephraseInstructionMemory";

const PAGE_WIDTH = 816;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 1400;
const VIEWER_HEIGHT = 560;

interface HtmlDocumentViewerProps {
  kind: "resume" | "cover-letter";
  docId: string | number;
  title: string;
  /** The current version's number, shown as a badge on the zoom bar. */
  currentVersion?: string | number | null;
  /** When provided, the v{N} badge on the zoom bar opens the version marquee. */
  onOpenVersionMarquee?: () => void;
  /** Re-fetch the preview whenever this value changes (e.g. the active version). */
  refreshKey?: string | number;
  /** Stable key for remembering this view's zoom / fit choice per document. */
  memoryKey?: string;
  /** Whether to render a drag-to-widen handle on the right edge. */
  resizable?: boolean;
  /** Called during a resize drag with the new panel width in px. */
  onResize?: (width: number) => void;
  /**
   * When provided, clicking the rendered page opens the full editor for this
   * document. The click is captured on the preview document itself, so the
   * preview keeps scrolling and the zoom / fit controls stay fully usable.
   */
  onOpen?: () => void;
  /** Short affordance shown in the viewer header when `onOpen` is set. */
  openHint?: string;
  /**
   * When true the rendered document is treated as a working document: every
   * hoverable block gets a subtle dashed outline and a text cursor so it reads
   * as editable rather than a rendered image.
   */
  editMode?: boolean;
  /**
   * Let the document's own scroll hand off to the page once it reaches its end,
   * instead of trapping the reader's wheel in the pane. Used by the editor's
   * inline preview (which sits inside a scrolling page), never by modal views.
   */
  chainScroll?: boolean;
  /**
   * When provided, the rendered document participates in direct inline editing:
   * double-click a word / line to edit it in place, and any selection can be
   * rephrased with AI. Both persist by calling this with the updated document
   * text (the page creates a new version).
   */
  onSaveEditText?: (text: string, meta?: InlineEditMeta) => Promise<void> | void;
  /** Live Find query to highlight inside the rendered page (empty = none). */
  find?: string;
  /** Case-sensitive highlight matching. */
  matchCase?: boolean;
  /** Which match to emphasise and scroll to while stepping (0-based). */
  activeMatch?: number;
}

function clampZoom(z: number): number {
  // Keep three decimals so a typed exact value (e.g. 115% → 1.15) survives;
  // rounding to a tenth would silently snap 115% to 120%.
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
}

function touchDist(touches: TouchList): number {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );
}

/**
 * Make each rendered block read as editable in Edit mode: a subtle dashed
 * outline on hover plus a text cursor. Injected once per iframe document.
 */
const EDIT_AFFORDANCE_STYLE = [
  "body[data-hw-editable] p,body[data-hw-editable] li,body[data-hw-editable] h1,",
  "body[data-hw-editable] h2,body[data-hw-editable] h3,body[data-hw-editable] h4,",
  "body[data-hw-editable] td,body[data-hw-editable] figcaption{cursor:text;}",
  "body[data-hw-editable] p:hover,body[data-hw-editable] li:hover,",
  "body[data-hw-editable] h1:hover,body[data-hw-editable] h2:hover,",
  "body[data-hw-editable] h3:hover,body[data-hw-editable] h4:hover,",
  "body[data-hw-editable] td:hover,body[data-hw-editable] figcaption:hover{",
  "outline:1.5px dashed rgba(0,0,0,.25);outline-offset:2px;border-radius:3px;}",
].join("");

function injectEditAffordance(doc: Document): void {
  if (!doc.body || !doc.head) return;
  doc.body.dataset.hwEditable = "1";
  if (doc.getElementById("hw-edit-affordance")) return;
  const style = doc.createElement("style");
  style.id = "hw-edit-affordance";
  style.textContent = EDIT_AFFORDANCE_STYLE;
  doc.head.appendChild(style);
}

export default function HtmlDocumentViewer({
  kind,
  docId,
  title,
  currentVersion,
  onOpenVersionMarquee,
  refreshKey,
  memoryKey,
  resizable = true,
  onResize,
  onOpen,
  openHint = "Click the page to open the editor",
  editMode = false,
  onSaveEditText,
  chainScroll = false,
  find = "",
  matchCase = false,
  activeMatch = 0,
}: HtmlDocumentViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [htmlError, setHtmlError] = useState("");
  const [htmlUnavailable, setHtmlUnavailable] = useState(false);
  /** True when the last failure was a genuine "can't reach the server" error. */
  const [htmlErrorNetwork, setHtmlErrorNetwork] = useState(false);

  const [pngUrl, setPngUrl] = useState<string | null>(null);
  /** The current version's number, for the badge on the zoom bar. */
  const versionNumber =
    currentVersion === null || currentVersion === undefined || String(currentVersion) === ""
      ? ""
      : String(currentVersion);

  // Restore the remembered zoom / fit choice for this document, otherwise default to
  // fit-width so the page never overflows its pane on first render.
  const [zoom, setZoom] = useState(() => {
    const layout = memoryKey ? readDocViewLayout(memoryKey, MIN_ZOOM, MAX_ZOOM) : null;
    return layout ? layout.zoom : 1;
  });
  const [fitWidth, setFitWidth] = useState(() => {
    const layout = memoryKey ? readDocViewLayout(memoryKey, MIN_ZOOM, MAX_ZOOM) : null;
    return layout ? layout.fitWidth : true;
  });
  const [iframeHeight, setIframeHeight] = useState(760);
  /** The zoom % readout turns into an editable input while this is true. */
  const [zoomEditing, setZoomEditing] = useState(false);
  /** The in-progress typed zoom value (whole percent, no % sign). */
  const [zoomDraft, setZoomDraft] = useState("");
  /** Whether the preset-zoom menu is open. */
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pngUrlRef = useRef<string | null>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const prevMemoryKey = useRef(memoryKey);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);

  // Direct inline editing + "ask AI to rephrase" selection capture, shared by the
  // résumé editor, the cover-letter editor, and the quick preview.
  const edit = useInlineDocEdit({
    iframeRef,
    scrollRef,
    zoom,
    canEdit: Boolean(onSaveEditText),
    onSave: onSaveEditText,
    onOpen,
  });

  /** Whether there's a render to show — the stage exists only once there is. */
  const hasContent = Boolean(html && !htmlError && !htmlUnavailable);

  // Click-and-hold panning: grab the page and drag it within its frame. It only
  // engages when the page is zoomed PAST fit width (so there's actually overflow
  // to move) — below that a press still selects text and opens the editor.
  const pan = usePreviewPan({ scrollRef, iframeRef, ready: hasContent });

  // Re-evaluate whether the page can be grabbed whenever it is zoomed / re-measured.
  useEffect(() => {
    pan.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, iframeHeight, html, fitWidth]);

  /** The same per-document key the rephrase toolbar remembers its last choice under. */
  const rephraseKey = memoryKey ?? `${kind}_${docId}`;
  /** The last-used rephrase instruction, surfaced as a hint before any selection. */
  const [rememberedRephrase, setRememberedRephrase] =
    useState<RememberedRephraseInstruction | null>(() =>
      readRephraseInstruction(memoryKey ?? `${kind}_${docId}`)
    );

  // Re-read when the viewer is pointed at another document.
  useEffect(() => {
    setRememberedRephrase(readRephraseInstruction(rephraseKey));
  }, [rephraseKey]);

  // Stay in sync when the toolbar writes or clears the remembered choice.
  useEffect(
    () =>
      subscribeRephraseInstruction(() => {
        setRememberedRephrase(readRephraseInstruction(rephraseKey));
      }),
    [rephraseKey]
  );

  async function loadHtml() {
    setHtmlLoading(true);
    setHtmlError("");
    setHtmlErrorNetwork(false);
    setHtmlUnavailable(false);
    // Keep the previous render visible while re-fetching (e.g. after a version
    // change) so the document never flashes empty.
    // ALWAYS render the document's CURRENT SAVED BODY (the document-level
    // `/preview.html`), never a frozen per-version render — so this pane can
    // never sit behind a version bump. The `versionNumber` badge is still shown
    // from `currentVersion`, but the CONTENT is the live body the version marks.
    const fetchPreview = (): Promise<string | null> =>
      kind === "resume" ? getResumePreviewHtml(docId) : getCoverLetterPreviewHtml(docId);
    try {
      let text: string | null = null;
      for (let i = 0; i < 3; i += 1) {
        text = await fetchPreview();
        if (text) break;
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
      if (text) setHtml(text);
      else setHtmlUnavailable(true);
    } catch (err) {
      const network = isNetworkError(err);
      setHtmlErrorNetwork(network);
      setHtmlError(
        network
          ? "Check your connection and try again."
          : err instanceof ApiError
            ? err.message
            : "Could not load the preview."
      );
    } finally {
      setHtmlLoading(false);
    }
  }

  async function loadPng() {
    const fetcher = kind === "resume" ? getResumePreviewUrl : getCoverLetterPreviewUrl;
    try {
      const url = await fetcher(docId);
      if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current);
      pngUrlRef.current = url;
      setPngUrl(url);
    } catch {
      setPngUrl(null);
    }
  }

  useEffect(() => {
    loadHtml();
    loadPng();
    return () => {
      if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, kind, refreshKey, versionNumber]);

  // A different document → drop the stale render and any in-progress edit.
  useEffect(() => {
    setHtml(null);
    edit.reset();
    edit.clearSectionMove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, kind]);

  // Same document, new version / refresh → keep the render visible but end any
  // in-progress edit (the committed change is already saved as a version).
  useEffect(() => {
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Native non-passive wheel listener so Ctrl/⌘+scroll can preventDefault and drive zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setFitWidth(false);
      setZoom((z) => clampZoom(z + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Start at — and keep — "fit width" so the document never overflows its pane.
  // Re-measures once the document renders and whenever the doc changes, and keeps
  // re-fitting live as the pane is resized (drag-to-widen, window resize).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !fitWidth) return;
    setZoom(clampZoom(el.clientWidth / PAGE_WIDTH));
    const ro = new ResizeObserver(() => {
      const next = clampZoom(el.clientWidth / PAGE_WIDTH);
      // Only re-fit when the width genuinely changed — guards against
      // sub-pixel / scrollbar-induced feedback loops that caused jitter.
      setZoom((z) => (Math.abs(z - next) < 0.005 ? z : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitWidth, docId, kind, refreshKey, html]);

  // Swap in the remembered layout when the viewer is pointed at another document.
  useEffect(() => {
    if (prevMemoryKey.current === memoryKey) return;
    prevMemoryKey.current = memoryKey;
    const layout = memoryKey ? readDocViewLayout(memoryKey, MIN_ZOOM, MAX_ZOOM) : null;
    if (layout) {
      setFitWidth(layout.fitWidth);
      setZoom(layout.zoom);
    } else {
      setFitWidth(true);
      setZoom(1);
    }
  }, [memoryKey]);

  // Persist this view's zoom / fit choice so a reopened document comes back the same way.
  useEffect(() => {
    if (!memoryKey) return;
    writeDocViewLayout(memoryKey, { zoom, fitWidth });
  }, [memoryKey, zoom, fitWidth]);

  // Repaint the live Find highlights as the query / case toggle / active match
  // change (and after a new render loads), keeping the preview in step with the
  // editor's text box. Stepping also brings the active match into view.
  useEffect(() => {
    highlightMatches(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find, matchCase, activeMatch, html]);

  // Focus the typeable-zoom field as soon as it opens, ready to overtype.
  useEffect(() => {
    if (!zoomEditing) return undefined;
    const raf = requestAnimationFrame(() => {
      zoomInputRef.current?.focus();
      zoomInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [zoomEditing]);

  // Close the preset-zoom menu on an outside click or Escape.
  useEffect(() => {
    if (!zoomMenuOpen) return undefined;
    function onDown(e: MouseEvent) {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [zoomMenuOpen]);

  function zoomIn() {
    setFitWidth(false);
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }
  function zoomOut() {
    setFitWidth(false);
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  }
  /** Jump to an exact percentage (typed or picked from the preset menu). */
  function setZoomPercent(percent: number) {
    if (!Number.isFinite(percent)) return;
    setFitWidth(false);
    setZoom(clampZoom(percent / 100));
  }
  /** Apply the typed zoom value and drop back to the readout. */
  function commitZoomInput() {
    const parsed = Number.parseInt(zoomDraft.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) setZoomPercent(parsed);
    setZoomEditing(false);
  }

  function toggleFit() {
    if (fitWidth) {
      setFitWidth(false);
      setZoom(1);
    } else {
      const el = scrollRef.current;
      if (el) setZoom(clampZoom(el.clientWidth / PAGE_WIDTH));
      setFitWidth(true);
    }
  }

  /** Resolve a StyleSystem color token to an oklch() value for the iframe highlight. */
  function tokenColor(varName: string, alpha: number, fallback: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return raw ? `oklch(${raw} / ${alpha})` : fallback;
  }

  /** (Re)paint the live Find highlights inside the rendered page. Returns the ranges. */
  function paintFindHighlights(): Range[] {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return [];
    if (!find.trim()) {
      clearPreviewHighlights(doc);
      return [];
    }
    return applyPreviewHighlights(
      doc,
      find,
      matchCase,
      activeMatch,
      tokenColor("--accent-300", 0.5, "rgba(250, 204, 21, .45)"),
      tokenColor("--accent-500", 0.6, "rgba(249, 115, 22, .7)")
    );
  }

  /** Scroll the outer preview pane so a match inside the iframe is in view. */
  function scrollPreviewToRange(range: Range | undefined) {
    const el = scrollRef.current;
    if (!el || !range) return;
    const rect = range.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = el.scrollTop + (rect.top - elRect.top);
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: "smooth" });
  }

  /** Paint the highlights and, when stepping, bring the active match into view. */
  function highlightMatches(scroll: boolean) {
    const ranges = paintFindHighlights();
    if (!scroll || !find.trim() || !ranges.length) return;
    const idx = ((activeMatch % ranges.length) + ranges.length) % ranges.length;
    scrollPreviewToRange(ranges[idx]);
  }

  function handleIframeLoad(e: SyntheticEvent<HTMLIFrameElement>) {
    const iframe = e.currentTarget;
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc?.body || !win) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > 0) setIframeHeight(h + 32);
    // In Edit mode, mark the rendered blocks as editable (dashed hover outline
    // + text cursor) so the document reads as a working document, not an image.
    if (editMode && onSaveEditText) injectEditAffordance(doc);
    // Inline editing + selection capture are wired inside the rendered page
    // (same-origin srcDoc), so scrolling and the toolbar controls keep working.
    edit.attach(doc, win);
    // Repaint the live Find highlights now that the (re)loaded page is ready.
    highlightMatches(false);
    // Witness the press INSIDE the frame too, so the page can be grabbed anywhere.
    pan.attachIframe(doc);
  }

  function handleDownloadImage() {
    if (!pngUrl) return;
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `${kind === "resume" ? "resume" : "cover-letter"}-${docId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Revert the last section drag in one click and re-render the reverted page. */
  async function handleUndoSectionMove() {
    const ok = await edit.undoSectionMove();
    if (ok) loadHtml();
  }

  /** Abort an in-progress section move straight from its "Saving…" indicator. */
  function handleCancelSectionMove() {
    void edit.cancelSectionMove();
  }

  function onResizeStart(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startWidth = rootRef.current?.offsetWidth ?? 640;
    dragState.current = { startX: e.clientX, startWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  function onResizeMove(e: MouseEvent) {
    if (!dragState.current) return;
    const { startX, startWidth } = dragState.current;
    const next = Math.min(
      MAX_PANEL_WIDTH,
      Math.max(MIN_PANEL_WIDTH, startWidth + (e.clientX - startX))
    );
    onResize?.(next);
  }

  function onResizeEnd() {
    dragState.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }

  function onTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: touchDist(e.touches), zoom };
    }
  }
  function onTouchMove(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchStart.current) {
      const ratio = touchDist(e.touches) / pinchStart.current.dist;
      setFitWidth(false);
      setZoom(clampZoom(pinchStart.current.zoom * ratio));
    }
  }
  function onTouchEnd() {
    pinchStart.current = null;
  }

  // Per-section bold / italic overrides for the CURRENT version of this document,
  // injected into the rendered page. The hook re-renders this viewer on any
  // section-style change, so the page repaints in place. Memoised so the iframe's
  // srcDoc stays stable between renders (a fresh string every render would reload
  // it continuously). Styles are remembered per version, so switching versions
  // restores each one's own section styling.
  const sectionStyles = useSectionStyles(docId, versionNumber);
  const styledHtml = useMemo(
    () => injectSectionStyles(html, sectionStyles) ?? undefined,
    [html, sectionStyles]
  );

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-background-200 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
          Document
        </span>
        <div className="flex items-center gap-1">
          {onOpen && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 mr-1 whitespace-nowrap">
              <i className="ri-external-link-line"></i>
              {openHint}
            </span>
          )}
          {onOpen && (
            <button
              onClick={onOpen}
              title="Open full-screen readable view"
              aria-label="Open full-screen readable view"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-expand-diagonal-line"></i>
              <span className="hidden sm:inline">Expand</span>
            </button>
          )}
          {onSaveEditText && (
            <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 mr-1 whitespace-nowrap">
              <i className="ri-drag-move-2-line"></i>
              Drag a section header to reorder · select to rephrase
            </span>
          )}
          {onSaveEditText && rememberedRephrase && (
            <span
              className="hidden xl:inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full mr-1 max-w-[220px]"
              title={
                rememberedRephrase.kind === "preset"
                  ? `Rephrase presets as ${rememberedRephrase.value} by default (from your last choice here)`
                  : `Rephrase opens pre-filled with your saved instruction: ${rememberedRephrase.value}`
              }
            >
              <i className="ri-magic-line flex-shrink-0"></i>
              <span className="truncate">Rephrase: {rememberedRephrase.value}</span>
            </span>
          )}
          {pngUrl && (
            <button
              onClick={handleDownloadImage}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 px-2 py-1 rounded-md hover:bg-primary-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-2-line"></i>
              Download image
            </button>
          )}
          <button
            onClick={() => {
              loadHtml();
              loadPng();
            }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
            aria-label="Refresh preview"
          >
            <i className="ri-refresh-line"></i>
          </button>
        </div>
      </div>

      {pngUrl && (
        <div className="px-4 py-2 border-b border-background-200 bg-background-100/40 flex items-center gap-3">
          <button
            onClick={handleDownloadImage}
            className="relative group shrink-0 cursor-pointer"
            title="Download image"
          >
            <img
              src={pngUrl}
              alt={`${title} page thumbnail`}
              className="h-14 w-10 object-cover object-top rounded border border-background-200"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-black/60 text-white transition-opacity">
              <i className="ri-download-2-line"></i>
            </span>
          </button>
          <span className="text-xs text-foreground-500">
            Page thumbnail — click to download the image
          </span>
        </div>
      )}

      {hasContent && (
        <div className="px-3 py-2 border-b border-background-200 flex items-center gap-2 flex-wrap">
          {versionNumber &&
            (onOpenVersionMarquee ? (
              <button
                type="button"
                onClick={onOpenVersionMarquee}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-900 bg-primary-100 ring-1 ring-primary-200 hover:ring-primary-400 hover:bg-primary-200 px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer transition-colors"
                title="Browse this document's versions and switch to another"
                aria-label={`Current version v${versionNumber} — open the version marquee`}
              >
                <i className="ri-git-branch-line"></i>
                v{versionNumber}
                <i className="ri-arrow-down-s-line text-sm" aria-hidden="true"></i>
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-900 bg-primary-100 ring-1 ring-primary-200 px-2.5 py-1 rounded-full whitespace-nowrap"
                title="The current version shown here"
                aria-label={`Current version v${versionNumber}`}
              >
                <i className="ri-git-branch-line"></i>
                v{versionNumber}
              </span>
            ))}
          <div className="inline-flex items-center">
            <div className="inline-flex items-center rounded-l-md border border-background-200 bg-background-50 overflow-hidden">
              <button
                onClick={zoomOut}
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
                aria-label="Zoom out"
              >
                <i className="ri-zoom-out-line"></i>
              </button>
              {zoomEditing ? (
                <input
                  ref={zoomInputRef}
                  value={zoomDraft}
                  onChange={(e) => setZoomDraft(e.target.value)}
                  onBlur={commitZoomInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitZoomInput();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setZoomEditing(false);
                    }
                  }}
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="Type an exact zoom percentage"
                  title="Type an exact zoom percentage, then press Enter"
                  className="w-[52px] h-8 px-1 text-xs font-semibold text-center text-foreground-800 tabular-nums bg-background-50 focus:bg-primary-50 outline-none"
                />
              ) : (
                <button
                  onClick={() => {
                    setZoomDraft(String(Math.round(zoom * 100)));
                    setZoomEditing(true);
                  }}
                  className="h-8 min-w-[46px] px-2 text-xs font-semibold text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap tabular-nums"
                  title="Click to type an exact zoom percentage"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
              <button
                onClick={zoomIn}
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
                aria-label="Zoom in"
              >
                <i className="ri-zoom-in-line"></i>
              </button>
            </div>
            <div ref={zoomMenuRef} className="relative">
              <button
                onClick={() => setZoomMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                title="Preset zoom levels"
                aria-label="Preset zoom levels"
                className="w-6 h-8 flex items-center justify-center rounded-r-md border border-l-0 border-background-200 text-foreground-600 hover:bg-background-100 hover:text-foreground-900 cursor-pointer"
              >
                <i className="ri-arrow-down-s-line"></i>
              </button>
              {zoomMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 z-30 mt-1.5 min-w-[132px] rounded-md border border-background-300 bg-background-50 py-1"
                >
                  <span className="block px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
                    Presets
                  </span>
                  {ZOOM_PRESETS.map((preset) => {
                    const percent = Math.round(preset * 100);
                    const active = Math.round(zoom * 100) === percent;
                    return (
                      <button
                        key={preset}
                        role="menuitem"
                        onClick={() => {
                          setZoomPercent(percent);
                          setZoomMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? "text-primary-700 bg-primary-50"
                            : "text-foreground-700 hover:bg-background-100"
                        }`}
                      >
                        {percent}%
                        {active && <i className="ri-check-line text-primary-600"></i>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={toggleFit}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              fitWidth
                ? "bg-accent-500 text-background-50 dark:text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900 border border-background-200"
            }`}
          >
            <i className="ri-arrow-left-right-line"></i>
            Fit width
          </button>
          {edit.editing && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap">
              <i className="ri-edit-2-line"></i>
              Editing — Enter to save · Esc to cancel
            </span>
          )}
          {edit.canUndoSectionMove && !edit.editing && (
            <button
              onClick={handleUndoSectionMove}
              title="Restore the section order from before your last drag"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-go-back-line"></i>
              Undo last section move
            </button>
          )}
          {edit.sectionMovePending && (
            <button
              onClick={handleCancelSectionMove}
              title="Cancel this section move"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-600 bg-background-50 border border-background-200 hover:border-accent-300 hover:text-foreground-950 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-loader-4-line animate-spin"></i>
              Saving section move…
              <span className="inline-flex items-center gap-0.5 font-semibold text-accent-700">
                <i className="ri-close-line"></i>
                Cancel
              </span>
            </button>
          )}
          {edit.saving && !edit.sectionMovePending && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 whitespace-nowrap">
              <i className="ri-loader-4-line animate-spin"></i>
              Saving…
            </span>
          )}
        </div>
      )}

      {htmlLoading && !html ? (
        <div
          className="flex items-center justify-center gap-2 text-sm text-foreground-500"
          style={{ height: VIEWER_HEIGHT }}
        >
          <i className="ri-loader-4-line animate-spin"></i>
          Rendering preview…
        </div>
      ) : htmlError || htmlUnavailable ? (
        <div
          className="flex flex-col items-center justify-center gap-2 px-4 text-center"
          style={{ height: VIEWER_HEIGHT }}
        >
          <i className="ri-error-warning-line text-2xl text-foreground-400"></i>
          <p className="text-sm text-foreground-500">
            {htmlErrorNetwork
              ? "Can't reach the server"
              : htmlError
                ? "Couldn't render the preview"
                : "Preview unavailable"}
          </p>
          <p className="text-xs text-foreground-400 max-w-sm">
            {htmlErrorNetwork
              ? "We couldn't reach the server to render this document. Your document is safe — check your connection and try again."
              : htmlError ||
                `No readable text was detected in this ${
                  kind === "resume" ? "résumé" : "cover letter"
                }, so a preview couldn't be generated.`}
          </p>
          <button
            onClick={loadHtml}
            disabled={htmlLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <i className={htmlLoading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
            Retry preview
          </button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={`overflow-auto bg-background-100/30 doc-scroll${chainScroll ? " doc-scroll-chain" : ""}${
            pan.panning ? " cursor-grabbing" : pan.canPan ? " cursor-grab" : ""
          }`}
          style={{ height: VIEWER_HEIGHT }}
          onPointerDown={pan.onPointerDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="mx-auto"
            style={{ width: PAGE_WIDTH * zoom, height: iframeHeight * zoom }}
          >
            <div
              style={{
                width: PAGE_WIDTH,
                height: iframeHeight,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={styledHtml}
                title={`${title} preview`}
                className="border-0 bg-white"
                style={{ width: PAGE_WIDTH, height: iframeHeight }}
                onLoad={handleIframeLoad}
              />
            </div>
          </div>
        </div>
      )}
      </div>

      {resizable && (
        <div
          onMouseDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document pane"
          title="Drag to resize · or use the pane presets in the header"
          className="group absolute -right-2 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center z-10"
        >
          <span className="absolute inset-y-0 right-1.5 w-0.5 bg-accent-300/70 group-hover:bg-accent-500 transition-colors" />
          <span className="relative z-10 w-3 h-12 rounded-full bg-accent-400 group-hover:bg-accent-600 flex items-center justify-center transition-colors">
            <i className="ri-more-2-fill rotate-90 text-background-50 text-xs"></i>
          </span>
        </div>
      )}

      {edit.selection && typeof document !== "undefined" &&
        createPortal(
          <RephraseToolbar
            anchor={{ left: edit.selection.left, top: edit.selection.top }}
            selectionText={edit.selection.text}
            context={edit.selection.context}
            mode={edit.selection.mode}
            memoryKey={memoryKey ?? `${kind}_${docId}`}
            onApply={edit.applyRephrase}
            onClose={edit.closeSelection}
            onRegisterShortcut={edit.registerRephraseShortcut}
            onRegisterCopyShortcut={edit.registerCopyShortcut}
          />,
          document.body
        )}
    </div>
  );
}