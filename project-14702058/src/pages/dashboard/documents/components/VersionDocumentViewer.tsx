import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentVersion } from "@/lib/documents";
import { SOURCE_META, formatDate, sourceKind, versionTitle } from "./versionMeta";
import type { VersionKind, VersionedDoc } from "./versionMeta";
import useVersionPreviewHtml from "./useVersionPreviewHtml";
import VersionHtmlPreview from "./VersionHtmlPreview";
import VersionZoomToolbar from "./VersionZoomToolbar";
import useVersionZoom from "./useVersionZoom";
import SectionStyleMenu from "./SectionStyleMenu";
import ReadableDocumentModal from "./ReadableDocumentModal";
import { PAPER_WIDTH } from "@/pages/dashboard/documents/templates/themes/paper";

interface VersionDocumentViewerProps<T extends VersionedDoc = VersionedDoc> {
  /** Which document kind this viewer paints (résumé / cover letter). */
  kind: VersionKind;
  /** The document id. */
  docId: string | number;
  /** The document's display title, for the full-size readable view. */
  title: string;
  /** The document's saved versions — one of them is shown large here. */
  versions: DocumentVersion[];
  /** The active version (the one currently marked "Current"). */
  activeVersion: string | number | null | undefined;
  /**
   * A version the reader picked from the marquee to PREVIEW, without making it
   * current. When set (and present in `versions`) it wins over the active version,
   * so clicking a version card in the strip shows that same version large here.
   */
  selectedVersion?: string | number | null;
  /**
   * Make the currently-previewed version the document's CURRENT one. The host
   * awaits the activate call and re-renders from the response, so the "Current"
   * label only ever reflects what the backend accepted.
   */
  onSelect?: (version: string | number) => void;
  /** The version mid-activate (shows a spinner on the CTA); null when idle. */
  selecting?: string | number | null;
  /** Abandon the preview and return to the document's current version. */
  onClearPreview?: () => void;
  /**
   * A change marker (e.g. the editor's refresh counter) that forces the rendered
   * version to be re-fetched. Bumped on EVERY document mutation — including an
   * in-place save that does NOT change the version number — so the document on
   * screen always repaints to match what was just saved.
   */
  refreshKey?: string | number;
}

/**
 * The MAIN document viewer for the version strip: shows the currently selected /
 * active version large, at the top of the editor, with the lightweight thumbnail
 * strip sitting below it.
 *
 * It paints ONE version's crisp, reflowable, selectable HTML page (a single
 * iframe — not a mounted document DOM), with zoom / fit-width controls so the
 * page can be magnified to taste. "Read full size" opens the same version in the
 * full-screen readable view (which carries its own Select-version row).
 *
 * It FOLLOWS the marquee: a version the reader clicks in the strip is shown here
 * (via `selectedVersion`) even before it is made current.
 */
export default function VersionDocumentViewer<T extends VersionedDoc = VersionedDoc>({
  kind,
  docId,
  title,
  versions,
  activeVersion,
  selectedVersion,
  onSelect,
  selecting,
  onClearPreview,
  refreshKey,
}: VersionDocumentViewerProps<T>) {
  const [readOpen, setReadOpen] = useState(false);
  /** The scroll/fit stage — measured so "fit" and the % readout are accurate. */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(PAPER_WIDTH);
  /** Viewport height, so "Fit page" can size the whole A4 page into the stage. */
  const [viewportH, setViewportH] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight
  );
  /**
   * Zoom, remembered PER document (and shared with the full-size lightbox): the
   * Fit page / Fit width / 100% choice survives a reload, and a brand-new
   * document opens whole-page (Fit page) first.
   */
  const zoomKey = `${kind}:${docId}`;
  const zoomState = useVersionZoom({
    memoryKey: zoomKey,
    pageWidth: PAPER_WIDTH,
    stageW,
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const apply = () => setStageW(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The scroll stage is capped to 72% of the viewport; the same measured cap
  // bounds the stage AND feeds "Fit page" so the whole page comes into view.
  const stageMaxH = Math.max(320, Math.round(viewportH * 0.72));

  // The version to show large: the marquee's pick first, else the active version,
  // else the newest saved one.
  const active = useMemo(() => {
    const pickKey =
      selectedVersion === null || selectedVersion === undefined
        ? ""
        : String(selectedVersion);
    const activeKey = String(activeVersion ?? "");
    const wanted = pickKey || activeKey;
    return (
      versions.find((v) => String(v.version) === wanted) ??
      versions.find((v) => String(v.version) === activeKey) ??
      [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0] ??
      null
    );
  }, [versions, activeVersion, selectedVersion]);

  const versionId = active?.version ?? "";
  const isCurrent = Boolean(
    active && String(active.version) === String(activeVersion ?? "")
  );
  // The version's crisp, reflowable, selectable HTML page — the readable surface.
  // (The marquee thumbnails keep using lightweight rasterised page IMAGES instead.)
  // The version's own design is the revision marker, so a reset / re-design
  // re-fetches the page and repaints it at once.
  const htmlState = useVersionPreviewHtml(
    kind,
    docId,
    versionId,
    Boolean(active),
    `${active?.template_id ?? ""}:${refreshKey ?? ""}`,
    activeVersion
  );

  const meta = active ? SOURCE_META[sourceKind(active)] : null;
  const date = active ? formatDate(active.created_at) : "";
  const activeLabel =
    typeof activeVersion === "string" || typeof activeVersion === "number"
      ? String(activeVersion)
      : "";

  // True when the version on screen was picked to PREVIEW and is not (yet) the
  // document's current version — the state that needs an obvious second step.
  const isPreviewing = Boolean(
    active &&
      selectedVersion !== null &&
      selectedVersion !== undefined &&
      !isCurrent
  );
  const selectingThis =
    selecting !== null &&
    selecting !== undefined &&
    active !== null &&
    String(selecting) === String(active.version);

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-file-text-line text-lg"></i>
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-medium text-foreground-950 truncate">
              {active ? versionTitle(active) : "Document"}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {active &&
                (isCurrent ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-check-line"></i>
                    Current version{activeLabel ? ` · ${activeLabel}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-eye-line"></i>
                    Previewing — not yet applied
                  </span>
                ))}
              {meta && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}
                >
                  <i className={meta.icon}></i>
                  {meta.label}
                </span>
              )}
              {date && (
                <span className="text-[11px] text-foreground-500 whitespace-nowrap">{date}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SectionStyleMenu docId={docId} version={versionId} />
          <button
            type="button"
            onClick={() => setReadOpen(true)}
            disabled={!active}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <i className="ri-expand-diagonal-line"></i>
            Read full size
          </button>
        </div>
      </div>

      {isPreviewing && onSelect && (
        <div className="px-5 py-3 border-b border-accent-200 bg-accent-50 flex items-center justify-between gap-3 flex-wrap animate-fade-in-up">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-eye-line text-lg"></i>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-900">
                Previewing — not yet applied
              </p>
              <p className="text-xs text-foreground-600 truncate">
                You&apos;re previewing {active ? versionTitle(active) : "this version"}. It
                isn&apos;t your current version until you select it.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onClearPreview && (
              <button
                type="button"
                onClick={onClearPreview}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-go-back-line"></i>
                View current version
              </button>
            )}
            <button
              type="button"
              onClick={() => active && onSelect(active.version)}
              disabled={selectingThis}
              className="inline-flex items-center gap-2 text-sm font-bold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ring-1 ring-primary-400/50"
            >
              {selectingThis ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-check-double-line"></i>
              )}
              {selectingThis ? "Applying…" : "Select this version"}
            </button>
          </div>
        </div>
      )}

      <VersionZoomToolbar
        mode={zoomState.mode}
        zoomPercent={zoomState.zoomPercent}
        atMin={zoomState.atMin}
        atMax={zoomState.atMax}
        isActualSize={zoomState.isActualSize}
        onStep={zoomState.step}
        onSetMode={zoomState.setMode}
        onActualSize={zoomState.setActualSize}
        onSetZoomPercent={zoomState.setZoomPercent}
        hint="Cmd/Ctrl + − / 0 · F to flip Fit page / Fit width · selectable text"
      />

      <div className="p-5 bg-background-100/40 flex justify-center">
        <div
          ref={stageRef}
          className="w-full max-w-[820px] overflow-auto doc-scroll doc-scroll-chain"
          style={{ maxHeight: stageMaxH }}
        >
          <VersionHtmlPreview
            html={htmlState.html}
            status={htmlState.status}
            title={active ? versionTitle(active) : title}
            width={PAPER_WIDTH}
            docKey={docId}
            version={versionId}
            zoom={
              zoomState.mode === "width"
                ? "fit"
                : zoomState.mode === "page"
                  ? "fit-page"
                  : zoomState.zoom
            }
            fitHeight={stageMaxH}
            onScaleChange={zoomState.reportScale}
          />
        </div>
      </div>

      {readOpen && (
        <ReadableDocumentModal
          kind={kind}
          docId={docId}
          title={title}
          version={versionId}
          onClose={() => setReadOpen(false)}
        />
      )}
    </section>
  );
}