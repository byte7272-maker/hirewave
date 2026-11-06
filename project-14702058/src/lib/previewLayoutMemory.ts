/**
 * Remembers how a document view was left — its zoom / fit choice and the pane
 * split — so reopening the same document restores the exact same layout.
 * Everything is best-effort and scoped to localStorage; storage failures are
 * swallowed so the view still works for the current session.
 */

/** Document-pane width presets offered next to the resize handle. */
export type PanePreset = "fit" | "50" | "75";
/** "custom" means the user dragged the handle to an exact width. */
export type PaneMode = PanePreset | "custom";

export interface DocViewLayout {
  zoom: number;
  fitWidth: boolean;
}

export interface PaneLayout {
  preset: PaneMode;
  px: number | null;
}

const VIEW_PREFIX = "hirewave_docview_";
const PANE_PREFIX = "hirewave_docpane_";

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
}

/** Read the remembered zoom / fit choice, clamped to the viewer's zoom range. */
export function readDocViewLayout(
  key: string,
  min: number,
  max: number
): DocViewLayout | null {
  if (!key) return null;
  const parsed = readJSON(VIEW_PREFIX + key) as Partial<DocViewLayout> | null;
  if (!parsed) return null;
  const zoom =
    typeof parsed.zoom === "number" && Number.isFinite(parsed.zoom) ? parsed.zoom : null;
  const fitWidth = typeof parsed.fitWidth === "boolean" ? parsed.fitWidth : null;
  if (zoom === null || fitWidth === null) return null;
  const clamped = Math.min(max, Math.max(min, Math.round(zoom * 10) / 10));
  return { zoom: clamped, fitWidth };
}

/** Persist the zoom / fit choice for one document view. */
export function writeDocViewLayout(key: string, layout: DocViewLayout): void {
  if (!key) return;
  writeJSON(VIEW_PREFIX + key, layout);
}

/** Read the remembered document-pane split for one document. */
export function readPaneLayout(key: string): PaneLayout | null {
  if (!key) return null;
  const parsed = readJSON(PANE_PREFIX + key) as Partial<PaneLayout> | null;
  if (!parsed) return null;
  const preset = parsed.preset;
  const isValid =
    preset === "fit" || preset === "50" || preset === "75" || preset === "custom";
  if (!isValid) return null;
  const px =
    typeof parsed.px === "number" && Number.isFinite(parsed.px) ? parsed.px : null;
  return { preset: preset as PaneMode, px };
}

/** Persist the document-pane split for one document. */
export function writePaneLayout(key: string, layout: PaneLayout): void {
  if (!key) return;
  writeJSON(PANE_PREFIX + key, layout);
}