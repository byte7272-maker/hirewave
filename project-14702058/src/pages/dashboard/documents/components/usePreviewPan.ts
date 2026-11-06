import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Click-and-hold panning for a rendered document preview.
 *
 * The preview paints the page inside a same-origin `<iframe>` inside a
 * `overflow-auto` stage, so a press on the document itself NEVER bubbles to the
 * parent — the drag has to be captured inside the frame too. This hook wires both
 * surfaces:
 *
 *  • the stage's own gutter/margins (`onPointerDown`), and
 *  • the loaded document (`attachIframe`), which the viewer calls on iframe load.
 *
 * It only engages when the page genuinely overflows its stage HORIZONTALLY —
 * i.e. the reader has zoomed in PAST fit width — because a whole-page-in-view
 * stage has nothing to pan. Below that, a press behaves exactly as before:
 * text selection, double-click-to-edit and the section drag handles all still work.
 *
 * A short movement threshold keeps simple clicks (open the editor) and
 * double-clicks (inline edit) intact: only a genuine drag becomes a pan, and the
 * click that trails a pan is swallowed so it can't also open the editor.
 */

interface PanState {
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  /** True once the press has travelled far enough to count as a drag. */
  panning: boolean;
  /** The frame window the press began in, so its listeners are removed cleanly. */
  iframeWin: Window | null;
}

/** Movement (px) a press must travel before it becomes a pan rather than a click. */
const PAN_THRESHOLD = 4;
/** Tolerance (px) so a fit-to-width page (zero overflow) never reads as pannable. */
const OVERFLOW_TOLERANCE = 2;

interface UsePreviewPanArgs {
  /** The scrolling stage that holds the scaled page. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The rendered document frame. */
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** True once the stage is actually mounted (drives the overflow measurement). */
  ready: boolean;
}

export interface PreviewPan {
  /** True when the page overflows the stage horizontally (zoomed past fit width). */
  canPan: boolean;
  /** True while a pan is actively dragging the page. */
  panning: boolean;
  /** Stage-level press handler (covers the gutter around the page). */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Wire the loaded document's own press handler; returns a cleanup function. */
  attachIframe: (doc: Document) => void;
  /** Re-measure whether the page is currently pannable. */
  refresh: () => void;
}

export default function usePreviewPan({
  scrollRef,
  iframeRef,
  ready,
}: UsePreviewPanArgs): PreviewPan {
  const [canPan, setCanPan] = useState(false);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<PanState | null>(null);
  const canPanRef = useRef(false);
  const panningRef = useRef(false);
  /** Swallows the single click that trails a pan, so it can't open the editor. */
  const suppressClickRef = useRef(false);
  /** The loaded document, kept for cursor + cleanup bookkeeping. */
  const iframeDocRef = useRef<Document | null>(null);
  /** The document's cursor before we showed the grab affordance, so we restore it. */
  const savedCursorRef = useRef<string | null>(null);
  /** Removes the listeners wired into the current document. */
  const iframeCleanupRef = useRef<(() => void) | null>(null);

  panningRef.current = panning;

  /** A page is pannable only when it is WIDER than its stage (zoomed past fit width). */
  const isPannable = useCallback(() => {
    const el = scrollRef.current;
    return !!el && el.scrollWidth - el.clientWidth > OVERFLOW_TOLERANCE;
  }, [scrollRef]);

  /** Re-measure the overflow and keep the grab affordance in sync. */
  const refresh = useCallback(() => {
    const next = isPannable();
    if (next !== canPanRef.current) {
      canPanRef.current = next;
      setCanPan(next);
    }
    return next;
  }, [isPannable]);

  /** Show the honest "you can grab this" cursor inside the document. */
  const syncIframeCursor = useCallback(() => {
    const doc = iframeDocRef.current;
    if (!doc?.body) return;
    if (canPanRef.current) {
      if (savedCursorRef.current === null) {
        savedCursorRef.current = doc.body.style.cursor || "";
      }
      doc.body.style.cursor = panningRef.current ? "grabbing" : "grab";
    } else if (savedCursorRef.current !== null) {
      doc.body.style.cursor = savedCursorRef.current;
      savedCursorRef.current = null;
    }
  }, []);

  /** Finish a pan: drop listeners, restore cursor/selection, swallow the trailing click. */
  const endPan = useCallback(() => {
    const st = panRef.current;
    panRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endPan);
    window.removeEventListener("pointercancel", endPan);
    const win = st?.iframeWin;
    if (win) {
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", endPan);
      win.removeEventListener("pointercancel", endPan);
    }
    document.body.style.userSelect = "";
    const doc = iframeDocRef.current;
    if (doc?.body) doc.body.style.userSelect = "";
    // A real drag shouldn't also fire the "open the editor" click underneath it.
    if (st?.panning) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    setPanning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Move the stage in step with the pointer, once the drag has passed the threshold. */
  const onMove = useCallback(
    (e: PointerEvent) => {
      const st = panRef.current;
      const el = scrollRef.current;
      if (!st || !el) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (!st.panning) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
        st.panning = true;
        setPanning(true);
        document.body.style.userSelect = "none";
        const doc = iframeDocRef.current;
        if (doc?.body) doc.body.style.userSelect = "none";
        try {
          iframeRef.current?.contentWindow?.getSelection()?.removeAllRanges();
        } catch {
          /* selection APIs can throw across frames — non-fatal */
        }
        try {
          window.getSelection()?.removeAllRanges();
        } catch {
          /* non-fatal */
        }
      }
      e.preventDefault();
      el.scrollLeft = st.startScrollLeft - dx;
      el.scrollTop = st.startScrollTop - dy;
    },
    [scrollRef, iframeRef]
  );

  /** Begin tracking a press; only listens — the pan starts once it genuinely moves. */
  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      // Gated on horizontal overflow: a fit-width page has nothing to pan.
      if (el.scrollWidth - el.clientWidth <= OVERFLOW_TOLERANCE) return;
      suppressClickRef.current = false;
      const iframeWin = iframeRef.current?.contentWindow ?? null;
      panRef.current = {
        startX: clientX,
        startY: clientY,
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
        panning: false,
        iframeWin,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endPan);
      window.addEventListener("pointercancel", endPan);
      if (iframeWin) {
        iframeWin.addEventListener("pointermove", onMove);
        iframeWin.addEventListener("pointerup", endPan);
        iframeWin.addEventListener("pointercancel", endPan);
      }
    },
    [scrollRef, iframeRef, onMove, endPan]
  );

  /** Stage-level press (the gutter / margins around the rendered page). */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const el = scrollRef.current;
      // Leave the native scrollbars alone — a press there is a scrollbar drag,
      // not a grab, so only the content box starts a pan.
      if (el) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX > rect.left + el.clientWidth ||
          e.clientY > rect.top + el.clientHeight
        ) {
          return;
        }
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-hw-grip]")) return;
      beginPan(e.clientX, e.clientY);
    },
    [scrollRef, beginPan]
  );

  /** Wire the loaded document's own press handler + trailing-click guard. */
  const attachIframe = useCallback(
    (doc: Document) => {
      iframeCleanupRef.current?.();
      iframeDocRef.current = doc;
      const onDown = (e: PointerEvent) => {
        // A stale suppress flag (pan ended off the frame) shouldn't eat a real click.
        suppressClickRef.current = false;
        if (e.pointerType === "touch" || e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-hw-grip]")) return;
        beginPan(e.clientX, e.clientY);
      };
      // Capture phase, so it beats the inline-edit hook's bubble "open" listener.
      const onClickCapture = (e: MouseEvent) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      };
      doc.addEventListener("pointerdown", onDown);
      doc.addEventListener("click", onClickCapture, true);
      iframeCleanupRef.current = () => {
        doc.removeEventListener("pointerdown", onDown);
        doc.removeEventListener("click", onClickCapture, true);
      };
      refresh();
      syncIframeCursor();
    },
    [beginPan, refresh, syncIframeCursor]
  );

  // Measure on mount / when the stage appears, and keep watching its size so a
  // pane resize (or a zoom that re-flows the page) re-evaluates pannability.
  useEffect(() => {
    if (!ready) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    refresh();
    const ro = new ResizeObserver(() => refresh());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, scrollRef, refresh]);

  // Keep the in-frame grab cursor in step with the affordance / drag state.
  useEffect(() => {
    syncIframeCursor();
  }, [canPan, panning, syncIframeCursor]);

  // Never leave listeners or a locked cursor behind on unmount.
  useEffect(
    () => () => {
      if (panRef.current) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", endPan);
        window.removeEventListener("pointercancel", endPan);
        const win = panRef.current.iframeWin;
        if (win) {
          win.removeEventListener("pointermove", onMove);
          win.removeEventListener("pointerup", endPan);
          win.removeEventListener("pointercancel", endPan);
        }
        panRef.current = null;
      }
      iframeCleanupRef.current?.();
      iframeCleanupRef.current = null;
      document.body.style.userSelect = "";
    },
    [onMove, endPan]
  );

  return { canPan, panning, onPointerDown, attachIframe, refresh };
}