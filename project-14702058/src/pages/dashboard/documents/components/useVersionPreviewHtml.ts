import { useEffect, useState } from "react";
import {
  getCoverLetterPreviewHtml,
  getCoverLetterVersionPreviewHtml,
  getResumePreviewHtml,
  getResumeVersionPreviewHtml,
} from "@/lib/documents";
import type { VersionKind } from "./versionMeta";

/** Load state of a version's rendered HTML page. */
export type VersionHtmlStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface VersionHtmlState {
  /** The version's rendered HTML page source, or null while loading / unavailable. */
  html: string | null;
  status: VersionHtmlStatus;
}

/**
 * Fetch a set of rendered HTML page (auth-scoped) — the crisp, reflowable,
 * selectable-text source the MAIN document viewer and the full-size "Read full
 * size" lightbox render inside a styled, scaled iframe.
 *
 * Two sources are possible, deliberately:
 *  - When `activeVersion` is supplied AND the requested `version` IS that current
 *    version, the DOCUMENT-LEVEL page is fetched (`/preview.html`) — the current
 *    SAVED body. This is the live render of the résumé / cover letter, so it can
 *    never lag a version bump the way a frozen per-version render can.
 *  - Otherwise (no `activeVersion`, or the requested version is a historical one
 *    being deliberately previewed) the PINNED version's own page is fetched
 *    (`/versions/{v}/preview.html`).
 *
 * (The marquee thumbnails use the rasterised page IMAGES instead, via
 * {@link useVersionPreviewImage}, so a long strip stays cheap.)
 *
 * `enabled` gates the fetch so a viewer that isn't showing — or a lightbox that
 * is closed — makes no request.
 */
export default function useVersionPreviewHtml(
  kind: VersionKind,
  docId: string | number,
  version: string | number,
  enabled: boolean,
  /**
   * Optional revision marker (e.g. the version's own `template_id`). When it
   * changes — the version is re-designed or reset to the document's design — the
   * page is re-fetched so the readable surface repaints the new design at once.
   */
  revision?: string | number,
  /**
   * The document's CURRENT version. When the requested `version` matches it, the
   * document-level page (the current saved body) is fetched instead of the
   * version's frozen render — so the current view can never sit behind a version
   * bump. Leave undefined to always fetch the pinned version's own render.
   */
  activeVersion?: string | number | null
): VersionHtmlState {
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<VersionHtmlStatus>("idle");

  // True when we're being asked to show the document's current version — then we
  // paint the live saved body rather than the frozen per-version render.
  const wantsCurrentBody =
    activeVersion !== null &&
    activeVersion !== undefined &&
    String(activeVersion) !== "" &&
    String(version) === String(activeVersion);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setStatus("loading");
    setHtml(null);
    const fetchPage = (): Promise<string | null> => {
      if (wantsCurrentBody) {
        return kind === "cover-letter"
          ? getCoverLetterPreviewHtml(docId)
          : getResumePreviewHtml(docId);
      }
      return kind === "cover-letter"
        ? getCoverLetterVersionPreviewHtml(docId, version)
        : getResumeVersionPreviewHtml(docId, version);
    };
    fetchPage()
      .then((next) => {
        if (!alive) return;
        if (next) {
          setHtml(next);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [kind, docId, version, enabled, revision, wantsCurrentBody]);

  return { html, status };
}