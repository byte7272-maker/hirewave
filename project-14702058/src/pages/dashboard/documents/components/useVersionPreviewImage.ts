import { useEffect, useRef, useState } from "react";
import {
  getCoverLetterVersionPreviewUrl,
  getResumeVersionPreviewUrl,
} from "@/lib/documents";
import type { VersionKind } from "./versionMeta";

/** Load state of a version's rendered page image. */
export type VersionImageStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface VersionImageState {
  /** An object URL for the rendered page image, or null while loading / unavailable. */
  url: string | null;
  status: VersionImageStatus;
}

/**
 * Fetch ONE saved version's rendered PAGE IMAGE (auth-scoped) and hand back an
 * object URL — the lightweight source every version thumbnail paints from.
 *
 * A card that uses this mounts a single `<img>` instead of the version's full
 * document DOM, so a strip of many versions never renders a dozen résumés at once
 * (the freeze this fixes). The object URL is revoked automatically when it
 * changes or the card unmounts, and `enabled` gates the fetch so an off-screen
 * card makes no request (lazy loading as it scrolls into view).
 *
 * `scale` picks the render size: 1 for the small marquee thumbnail, 2 for the
 * hover bubble and the full-size readable view.
 */
export default function useVersionPreviewImage(
  kind: VersionKind,
  docId: string | number,
  version: string | number,
  enabled: boolean,
  scale: 1 | 2 = 1,
  /**
   * Optional revision marker (e.g. the version's own `template_id`). When it
   * changes — the version is re-designed or reset to the document's design — the
   * page image is re-fetched so the thumbnail repaints the new design at once.
   */
  revision?: string | number
): VersionImageState {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<VersionImageStatus>("idle");
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let objectUrl: string | null = null;
    setStatus("loading");
    setUrl(null);
    const fetcher =
      kind === "cover-letter"
        ? getCoverLetterVersionPreviewUrl
        : getResumeVersionPreviewUrl;
    fetcher(docId, version, scale)
      .then((next) => {
        objectUrl = next;
        if (!alive) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        if (next) {
          setUrl(next);
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
  }, [kind, docId, version, enabled, scale, revision]);

  // Track the live URL and revoke the last one on unmount (no leak per card).
  useEffect(() => {
    urlRef.current = url;
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [url]);

  return { url, status };
}