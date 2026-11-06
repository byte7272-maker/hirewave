/**
 * Remembers the MAIN document viewer's zoom choice PER document, so reopening a
 * résumé or cover letter lands on the scale you last preferred — Fit width, Fit
 * page (the whole A4 page scaled into view), or a specific percentage — instead
 * of resetting every time.
 *
 * Keyed by document kind + id (e.g. `resume:42`), so two documents never share
 * the setting. Best-effort: storage failures are swallowed and the viewer falls
 * back to its default (Fit page — the whole A4 page in view), so a brand-new
 * document opens whole-page first.
 */

/**
 * The viewer's zoom mode.
 *
 *  - `"width"`  scale the page to fit the stage's COLUMN width.
 *  - `"page"`   scale the WHOLE page (width AND height) into the stage.
 *  - `"custom"` draw the page at the fixed `zoom` (1 = actual size).
 */
export type ViewerZoomMode = "width" | "page" | "custom";

export interface ViewerZoom {
  /** Which fit the viewer uses, or a fixed percentage when `"custom"`. */
  mode: ViewerZoomMode;
  /** The fixed zoom when `mode` is `"custom"` (1 = actual size). */
  zoom: number;
}

const STORAGE_PREFIX = "hirewave_viewer_zoom_";

function keyFor(docKey: string): string {
  return `${STORAGE_PREFIX}${docKey}`;
}

function isMode(value: unknown): value is ViewerZoomMode {
  return value === "width" || value === "page" || value === "custom";
}

/**
 * Read the remembered zoom for one document, or null when nothing usable is
 * stored (so the caller keeps its own default).
 */
export function readViewerZoom(docKey: string): ViewerZoom | null {
  if (!docKey) return null;
  try {
    const raw = localStorage.getItem(keyFor(docKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewerZoom> & {
      fitWidth?: unknown;
    };
    const zoom =
      typeof parsed.zoom === "number" && Number.isFinite(parsed.zoom)
        ? parsed.zoom
        : 1;
    if (isMode(parsed.mode)) return { mode: parsed.mode, zoom };
    // Migrate the earlier `{ fitWidth, zoom }` shape written before "Fit page".
    if (typeof parsed.fitWidth === "boolean") {
      return { mode: parsed.fitWidth ? "width" : "custom", zoom };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the zoom choice for one document. */
export function writeViewerZoom(docKey: string, layout: ViewerZoom): void {
  if (!docKey) return;
  try {
    localStorage.setItem(keyFor(docKey), JSON.stringify(layout));
  } catch {
    // Ignore storage failures — the zoom still applies for this session.
  }
}