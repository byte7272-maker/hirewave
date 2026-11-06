import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  exportCoverLetterPdf,
  exportResumePdf,
  getCoverLetterPreviewHtml,
  getCoverLetterVersionPreviewHtml,
  getResumePreviewHtml,
  getResumeVersionPreviewHtml,
} from "@/lib/documents";
import { useNarration } from "@/components/feature/NarrationProvider";
import { injectSectionStyles, useSectionStyles } from "@/lib/sectionStyles";

/** The rendered page width — a comfortable, stable reading measure (~820px). */
const PAGE_WIDTH = 816;

/** A safe download filename for the PDF export. */
function pdfFilename(title: string, kind: "resume" | "cover-letter"): string {
  const base = title
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || (kind === "resume" ? "resume" : "cover-letter")}.pdf`;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface ReadableDocumentModalProps {
  kind: "resume" | "cover-letter";
  docId: string | number;
  title: string;
  /**
   * When set, read THIS saved version's `preview.html`
   * (`GET /resumes|cover-letters/{id}/versions/{version}/preview.html`) instead of
   * the document's own preview — so the full-size read shows exactly the version
   * on screen. Omit to read the document's active version (the whole-document
   * preview).
   */
  version?: string | number;
  onClose: () => void;
}

/**
 * Full-screen, distraction-free readable view of a rendered document. It fetches
 * the same `preview.html` the inline viewer uses and presents it centered at a
 * comfortable reading width with its own scroll. Esc / backdrop / ✕ close it,
 * focus is trapped inside, page scroll is locked and restored on close, and any
 * read-aloud playback is stopped so audio can never outlive the modal.
 */
export default function ReadableDocumentModal({
  kind,
  docId,
  title,
  version,
  onClose,
}: ReadableDocumentModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(1200);
  const [scale, setScale] = useState(1);
  /** Whether a PDF export is in flight, plus its error (shown inline). */
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { stop } = useNarration();

  /** Close the modal — always halting any in-progress read-aloud first. */
  const close = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  /** Save the saved document as a PDF, rendered with its template/accent/typeface. */
  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const name = pdfFilename(title, kind);
      if (kind === "resume") await exportResumePdf(docId, name);
      else await exportCoverLetterPdf(docId, name);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : "Could not create the PDF."
      );
    } finally {
      setDownloading(false);
    }
  }

  // Load the rendered document (retrying briefly — preview may be generated async).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setUnavailable(false);
    // Load the rendered document (retrying briefly — preview may be generated async).
    // With a `version` set, this reads that version's own `preview.html`; without
    // one it reads the document's whole-document preview.
    const fetcher = version !== undefined && version !== ""
      ? kind === "resume"
        ? () => getResumeVersionPreviewHtml(docId, version)
        : () => getCoverLetterVersionPreviewHtml(docId, version)
      : kind === "resume"
        ? () => getResumePreviewHtml(docId)
        : () => getCoverLetterPreviewHtml(docId);
    (async () => {
      try {
        let text: string | null = null;
        for (let i = 0; i < 3; i += 1) {
          text = await fetcher();
          if (text || !active) break;
          await new Promise((r) => setTimeout(r, 700 * (i + 1)));
        }
        if (!active) return;
        if (text) setHtml(text);
        else setUnavailable(true);
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Could not load the preview.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kind, docId, version]);

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

  // Trap focus inside the dialog, close on Esc, and restore the previous focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
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
  }, [close]);

  // Stable reading scale — depends only on the modal width, never on scroll.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const recompute = () => {
      const w = el.clientWidth - 32;
      setScale(Math.max(0.4, Math.min(1, w / PAGE_WIDTH)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  function handleIframeLoad(e: SyntheticEvent<HTMLIFrameElement>) {
    const doc = e.currentTarget.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > 0) setIframeHeight(h + 48);
  }

  const hasContent = Boolean(html && !error && !unavailable);

  // Per-section bold / italic overrides for this version, injected into the
  // rendered page so the full-size read matches the main viewer. Styles are
  // remembered per version, so switching versions restores each one's own.
  const sectionStyles = useSectionStyles(docId, version);
  const styledHtml = useMemo(
    () => injectSectionStyles(html, sectionStyles) ?? undefined,
    [html, sectionStyles]
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-6">
      <div
        className="absolute inset-0 bg-foreground-950/50 dark:bg-black/60"
        onClick={close}
        aria-hidden="true"
      ></div>

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — full readable view`}
        tabIndex={-1}
        className="relative w-full max-w-[960px] h-full max-h-[94vh] bg-background-50 rounded-2xl border border-background-200 overflow-hidden flex flex-col outline-none"
      >
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
              <i className="ri-file-text-line"></i>
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-base font-medium text-foreground-950 truncate">
                {title}
              </h2>
              <span className="block text-xs text-foreground-500">Full readable view</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading}
              title="Save this document as a PDF"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {downloading ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-download-2-line"></i>
              )}
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
            <button
              onClick={close}
              aria-label="Close preview"
              title="Close (Esc)"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-950 cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="px-5 py-2 border-b border-accent-200 bg-accent-50 text-[12px] text-accent-900 flex items-center gap-1.5 flex-shrink-0">
            <i className="ri-error-warning-line"></i>
            {downloadError}
          </div>
        )}

        <div
          ref={bodyRef}
          className="flex-1 min-h-0 overflow-auto doc-scroll bg-background-100/40 px-4 py-6"
        >
          {loading && !html ? (
            <div className="h-full flex items-center justify-center gap-2 text-sm text-foreground-500">
              <i className="ri-loader-4-line animate-spin"></i>
              Rendering document…
            </div>
          ) : error || unavailable ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
              <i className="ri-error-warning-line text-2xl text-foreground-400"></i>
              <p className="text-sm text-foreground-500">
                {error || "This document has no readable preview yet."}
              </p>
            </div>
          ) : (
            <div
              className="mx-auto"
              style={{ width: PAGE_WIDTH * scale, height: iframeHeight * scale }}
            >
              <div
                style={{
                  width: PAGE_WIDTH,
                  height: iframeHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <iframe
                  srcDoc={styledHtml}
                  title={`${title} full preview`}
                  className="border-0 bg-white rounded-lg"
                  style={{ width: PAGE_WIDTH, height: iframeHeight }}
                  onLoad={handleIframeLoad}
                />
              </div>
            </div>
          )}
        </div>

        {hasContent && (
          <div className="px-5 py-2.5 border-t border-background-200 text-[11px] text-foreground-400 text-center flex-shrink-0">
            Press Esc to close · scroll inside this view to keep reading
          </div>
        )}
      </div>
    </div>
  );
}