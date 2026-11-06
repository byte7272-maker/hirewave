import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { injectSectionStyles, useSectionStyles } from "@/lib/sectionStyles";
import { applySectionSpotlight, clearSectionSpotlight } from "@/lib/previewSpotlight";
import type { VersionHtmlStatus } from "./useVersionPreviewHtml";

interface VersionHtmlPreviewProps {
  /** The version's rendered HTML page source (null while loading / unavailable). */
  html: string | null;
  /** Load state, so loading / empty / error read honestly instead of blank. */
  status: VersionHtmlStatus;
  /** The version's display title, for the iframe's accessible label. */
  title: string;
  /** Natural page width the document is laid out at (A4 paper width by default). */
  width?: number;
  /**
   * Scale mode.
   *
   *  - `"fit"` (the default) scales the page DOWN to this component's own width,
   *    so it stays crisp at any size and the text stays selectable.
   *  - `"fit-page"` scales the WHOLE page so BOTH its width and height come into
   *    view — the entire A4 sheet, not just the column. Requires `fitHeight`.
   *  - a number renders the page at that fixed zoom. The HOST is then responsible
   *    for wrapping this in the scroll container, so the reader can zoom in and
   *    pan around a larger-than-viewport page.
   */
  zoom?: number | "fit" | "fit-page";
  /**
   * The height (px) of the scroll stage, used by `zoom="fit-page"` so the page's
   * full height fits. Ignored unless the mode is `"fit-page"`.
   */
  fitHeight?: number;
  /**
   * Report the scale this preview actually landed on, so the host can show an
   * honest zoom percentage (especially for the measured fit modes).
   */
  onScaleChange?: (scale: number) => void;
  /** Wording for the honest "no content" state. */
  emptyHint?: string;
  /**
   * The document this page belongs to — used to look up its per-section bold /
   * italic overrides and inject them into the rendered page, so a section style
   * change repaints the page in place.
   */
  docKey?: string | number;
  /**
   * The version whose own section bold / italic overrides should be applied. When
   * omitted the document-level overrides are used instead. Per-version styles let
   * switching versions restore each one's own section styling.
   */
  version?: string | number | null;
  /**
   * A section heading to spotlight inside the page (read-only viewers only). The
   * workspace review cards jump to a section with this; matching is by heading
   * text, so it lines up with the document's `## Section` headings.
   */
  spotlightSection?: string | null;
  /** Bump to re-apply the spotlight even when the section name is unchanged. */
  spotlightNonce?: number;
}

/**
 * Render ONE saved version as a crisp, reflowable, selectable-text page inside a
 * styled iframe — the shared readable surface behind the MAIN document viewer and
 * the full-size "Read full size" lightbox.
 *
 * It paints the version's server-rendered `preview.html` (a single iframe, not a
 * mounted document DOM), self-sizes the frame to the page's true height, and
 * scales the page — down to fit its column (`zoom="fit"`), the whole page into
 * view (`zoom="fit-page"`), or to a caller-chosen zoom level so the reader can
 * magnify the page. Marquee thumbnails deliberately do NOT use this: they paint
 * lightweight rasterised page IMAGES.
 */
export default function VersionHtmlPreview({
  html,
  status,
  title,
  width = 816,
  zoom = "fit",
  fitHeight,
  onScaleChange,
  emptyHint = "This version has no preview yet.",
  docKey,
  version,
  spotlightSection,
  spotlightNonce,
}: VersionHtmlPreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [containerW, setContainerW] = useState(width);
  const [pageHeight, setPageHeight] = useState(1056);

  // Per-section bold / italic overrides, injected into the page's HTML. The hook
  // re-renders this preview the moment a section style flips, so the change shows
  // immediately with no props threaded through the page. (Memoised so React never
  // sees a "new" srcDoc every render, which would reload the iframe.)
  const sectionStyles = useSectionStyles(docKey, version);
  const srcDoc = useMemo(
    () => injectSectionStyles(html, sectionStyles) ?? undefined,
    [html, sectionStyles]
  );

  // Track this component's own width so "fit" can scale to it, and so a fixed
  // zoom larger than the column stays LEFT-aligned (centering a too-wide page
  // would push its left edge out of reach of the scrollbar).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const apply = () => setContainerW(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  /** Size the frame to the rendered page's true height so nothing is clipped. */
  function handleLoad(e: SyntheticEvent<HTMLIFrameElement>) {
    const doc = e.currentTarget.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > 0) setPageHeight(h + 32);
    // Re-apply the section spotlight on every (re)load — a srcDoc change swaps
    // the document out, so the mark has to be repainted.
    clearSectionSpotlight(doc);
    if (spotlightSection) applySectionSpotlight(doc, spotlightSection);
  }

  // Work out the scale up front (before the early returns) so the reported value
  // and the render always agree.
  const fitScale = Math.min(1, containerW / width);
  const pageFitScale =
    fitHeight && fitHeight > 0
      ? Math.min(1, containerW / width, fitHeight / pageHeight)
      : fitScale;
  const scale =
    zoom === "fit" ? fitScale : zoom === "fit-page" ? pageFitScale : zoom;
  // Center the page only while it fits; when zoomed past the column, keep its
  // left edge flush so the whole page is reachable by scrolling.
  const centered = width * scale <= containerW + 1;

  // Hand the landed-on scale back to the host, so its % readout stays truthful.
  useEffect(() => {
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);

  // Spotlight the requested section inside the painted page (and clear the old one
  // when the target changes). Re-runs when the page itself is swapped.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    clearSectionSpotlight(doc);
    if (spotlightSection) applySectionSpotlight(doc, spotlightSection);
  }, [spotlightSection, spotlightNonce, srcDoc]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-foreground-400 py-24">
        <i className="ri-loader-4-line text-2xl animate-spin"></i>
        <span className="text-sm">Rendering this version…</span>
      </div>
    );
  }

  if (status === "empty" || (status === "ready" && !html)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-foreground-400 py-24 text-center px-4">
        <i className="ri-file-text-line text-2xl"></i>
        <span className="text-sm">{emptyHint}</span>
      </div>
    );
  }

  if (status === "error" || !html) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-foreground-400 py-24 text-center px-4">
        <i className="ri-error-warning-line text-2xl"></i>
        <span className="text-sm">Couldn&apos;t load the version preview.</span>
      </div>
    );
  }

  const frame = (
    <iframe
      ref={frameRef}
      srcDoc={srcDoc}
      title={`${title} preview`}
      onLoad={handleLoad}
      className="border-0 bg-white"
      style={{ width, height: pageHeight, display: "block" }}
    />
  );

  return (
    <div ref={boxRef} className="w-full">
      <div
        className={centered ? "mx-auto" : ""}
        style={{ width: width * scale, height: pageHeight * scale }}
      >
        <div
          style={{
            width,
            height: pageHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {frame}
        </div>
      </div>
    </div>
  );
}