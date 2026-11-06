import { useEffect, useRef, useState, type ReactNode } from "react";
import { PAPER_WIDTH } from "@/pages/dashboard/documents/templates/themes/paper";
import VersionHtmlPreview from "./VersionHtmlPreview";
import VersionZoomToolbar from "./VersionZoomToolbar";
import useVersionZoom from "./useVersionZoom";
import type { VersionHtmlStatus } from "./useVersionPreviewHtml";

interface VersionFullSizeReaderProps {
  /** The version's rendered HTML page (already loaded — the reader only shows ready). */
  html: string | null;
  /** Load state of the HTML page. */
  status: VersionHtmlStatus;
  /** The version's display title, for the iframe's accessible label. */
  title: string;
  /** The document this version belongs to — used for its per-section styles. */
  docId?: string | number;
  /** The version whose own per-section bold / italic styles should apply. */
  version?: string | number | null;
  /** Optional trailing control in the zoom row (e.g. a Download-PDF button). */
  trailing?: ReactNode;
}

/**
 * The full-size lightbox's document surface: it gives the version's page the SAME
 * Fit page / Fit width / 100% toolbar the main viewer has, plus the Cmd/Ctrl +/−/0
 * click-stops and the F flip between Fit page and Fit width. The zoom is
 * transient (not written to memory), so opening the lightbox never overrides the
 * document's own remembered scale — it just opens whole-page (Fit page) first.
 *
 * It owns a bounded, self-scrolling stage (measured) so "Fit page" can size the
 * WHOLE A4 page into view, not just the column.
 */
export default function VersionFullSizeReader({
  html,
  status,
  title,
  docId,
  version,
  trailing,
}: VersionFullSizeReaderProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(PAPER_WIDTH);
  const [stageH, setStageH] = useState(600);

  // Measure the stage so Fit width / Fit page and the % readout stay accurate.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const apply = () => {
      setStageW(el.clientWidth);
      setStageH(el.clientHeight);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = useVersionZoom({
    // Transient: no memory key, no persistence — the overlay just opens whole-page.
    memoryKey: "",
    pageWidth: PAPER_WIDTH,
    stageW,
    persist: false,
    // The lightbox is the top surface, so it owns the keys even though its own
    // modal locks body scroll.
    respectOverlayLock: false,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <VersionZoomToolbar
        mode={zoom.mode}
        zoomPercent={zoom.zoomPercent}
        atMin={zoom.atMin}
        atMax={zoom.atMax}
        isActualSize={zoom.isActualSize}
        onStep={zoom.step}
        onSetMode={zoom.setMode}
        onActualSize={zoom.setActualSize}
        onSetZoomPercent={zoom.setZoomPercent}
        hint="Cmd/Ctrl + − / 0 · F to flip Fit page / Fit width · selectable text"
        trailing={trailing}
      />
      <div
        ref={stageRef}
        className="flex-1 min-h-0 overflow-auto doc-scroll bg-background-100/40 flex justify-center"
      >
        <div className="w-full max-w-[820px]">
          <VersionHtmlPreview
            html={html}
            status={status}
            title={title}
            width={PAPER_WIDTH}
            docKey={docId}
            version={version}
            zoom={
              zoom.mode === "width"
                ? "fit"
                : zoom.mode === "page"
                  ? "fit-page"
                  : zoom.zoom
            }
            fitHeight={stageH}
            onScaleChange={zoom.reportScale}
          />
        </div>
      </div>
    </div>
  );
}