import { useEffect, useRef, useState } from "react";
import {
  getCoverLetterVersion,
  getCoverLetterVersionRender,
  getResumeVersion,
  getResumeVersionRender,
  versionContentText,
  versionEmbeddedText,
  type DocumentVersion,
  type VersionContent,
} from "@/lib/documents";
import {
  isEmptyCoverLetter,
  type CoverLetterStructured,
} from "@/lib/coverLetterTemplate";
import type { JsonResume } from "@/lib/jsonResume";
import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_THEME_ID } from "@/pages/dashboard/documents/templates/themeRegistry";
import { DEFAULT_COVER_LETTER_THEME_ID } from "@/pages/dashboard/documents/templates/coverLetterThemeRegistry";
import { DEFAULT_FONT_ID } from "@/pages/dashboard/documents/templates/styleFonts";
import { readStyle } from "@/pages/dashboard/documents/templates/templateStyle";
import type { VersionKind } from "./versionMeta";
import { asString, asText } from "./versionMeta";

/** A version's content, rendered-ready for either document kind. */
export type VersionPreviewData = JsonResume | CoverLetterStructured;

export interface VersionPreviewState {
  /**
   * The version's FULL raw text (canonical markdown), ready to render — the
   * single source of truth for every preview surface. Null only when the version
   * genuinely carries no content at all.
   */
  markdown: string | null;
  /** A whitespace-normalized signature of the version's raw text, for diffing. */
  fingerprint: string | null;
  /**
   * The style (template/accent/typeface) this version renders with — resolved
   * from the local choice, else the server-authoritative template, else the
   * document's template. Callers paint with THIS so the design can never drift
   * from what the version is actually saved on.
   */
  style: VersionPreviewStyle;
  loading: boolean;
  /** True once a fetch has resolved (so "empty" is distinguishable from "not yet loaded"). */
  loaded: boolean;
  error: boolean;
  /**
   * Which path produced this preview: `"server"` = the server-authoritative
   * `/versions/{version}/render` endpoint (now carrying the version's markdown);
   * `"text"` = the version's own captured text; `null` while nothing resolved.
   */
  source: "server" | "text" | null;
}

/** Which template/accent/font a version should be rendered with. */
export interface VersionPreviewStyle {
  themeId: string;
  accentId: string;
  fontId: string;
  /**
   * True when the design was resolved from an AUTHORITATIVE source — the
   * version's own `template_id`, the server's rendered template, or the
   * document's template. False means nothing authoritative was available and we
   * fell back to the built-in default, so a UI can flag it (see the version
   * card's "couldn't load this version's design" note) instead of silently
   * showing a possibly-wrong look.
   */
  resolved?: boolean;
}

/**
 * Each built-in layout's own default accent + typeface (mirrors the template
 * catalog). A version with no explicitly-saved accent/typeface on this device
 * renders with its template's real look — never a hardcoded global default — so
 * a Classic résumé previews as serif/graphite, not sans/cobalt.
 */
const THEME_STYLE_DEFAULTS: Record<string, { accentId: string; fontId: string }> = {
  modern: { accentId: "cobalt", fontId: "inter" },
  minimal: { accentId: "graphite", fontId: "inter" },
  sidebar: { accentId: "teal", fontId: "inter" },
  timeline: { accentId: "amber", fontId: "inter" },
  classic: { accentId: "graphite", fontId: "georgia" },
  elegant: { accentId: "rose", fontId: "georgia" },
};

/** The accent + typeface a template ships with (global defaults for unknown ids). */
export function themeStyleDefaults(themeId: string): { accentId: string; fontId: string } {
  return (
    THEME_STYLE_DEFAULTS[themeId] ?? { accentId: DEFAULT_ACCENT.id, fontId: DEFAULT_FONT_ID }
  );
}

/**
 * The template/accent/font a version is remembered on. Priority:
 *   1. an explicitly-saved choice on this device (per-version, else the document's
 *      current choice) — the user's own customization;
 *   2. `fallbackThemeId` — the DURABLE design, i.e. the template the SERVER
 *      rendered the version with (or the document's own `template_id`). This is
 *      what makes a version show its real design on a fresh device / cleared
 *      storage, instead of silently dropping to the built-in default;
 *   3. the built-in default.
 * Accent + typeface follow the resolved template's own defaults when nothing was
 * explicitly saved, so the design stays coherent.
 */
export function resolveVersionPreviewStyle(
  kind: VersionKind,
  docId: string | number,
  version: string | number,
  fallbackThemeId?: string | null
): VersionPreviewStyle {
  const stored = readStyle(kind, docId, version);
  // A saved version's design is now carried server-side (the version's own
  // `template_id`, or the render endpoint's resolved template). That is
  // AUTHORITATIVE, so it wins over a browser-local choice; the local choice only
  // fills in when neither the server nor the version record names a design.
  const durableTheme = asText(fallbackThemeId);
  const themeId =
    durableTheme ||
    stored?.themeId ||
    (kind === "cover-letter" ? DEFAULT_COVER_LETTER_THEME_ID : DEFAULT_THEME_ID);
  const defaults = themeStyleDefaults(themeId);
  // Use the saved accent / typeface ONLY when they belong to the RESOLVED theme.
  // The local style memory is document-scoped (it falls back to the document's
  // current choice), so borrowing its accent / typeface while the layout comes
  // from somewhere else paints a version with a FOREIGN design — the "wrong
  // accent / font" bug. When the layouts disagree, the resolved theme's own
  // defaults keep the look coherent.
  const storedMatchesTheme = !stored?.themeId || stored.themeId === themeId;
  // Authoritative = the server's / the version's own template, or a saved local
  // choice. When NONE of those existed we dropped to the built-in default, so the
  // resolver reports itself unresolved and the card can flag it.
  const resolved = Boolean(durableTheme || stored?.themeId);
  return {
    themeId,
    accentId: (storedMatchesTheme && stored?.accentId) || defaults.accentId,
    fontId: (storedMatchesTheme && stored?.fontId) || defaults.fontId,
    resolved,
  };
}

/**
 * A stable, whitespace-insensitive signature of a version's text. Two versions
 * with the same signature read identically, so a card can flag "changed vs
 * current" without a byte-for-byte string compare that reflow / line-wrap noise
 * would defeat.
 */
export function contentFingerprint(content: string | null | undefined): string {
  return (content ?? "").replace(/\s+/g, " ").trim();
}

/** Session cache of fetched version content, so scrolling back never refetches. */
const contentCache = new Map<string, VersionContent>();

function cacheKey(kind: VersionKind, docId: string | number, version: string | number): string {
  return `${kind}:${docId}:${version}`;
}

/**
 * Fetch one saved version's content, memoized per session. Both the thumbnail
 * loader and the "current version" comparison share this, so the active
 * version's text is fetched at most once regardless of how many cards ask.
 */
function loadVersionContent(
  kind: VersionKind,
  docId: string | number,
  version: string | number
): Promise<VersionContent> {
  const key = cacheKey(kind, docId, version);
  const cached = contentCache.get(key);
  if (cached) return Promise.resolve(cached);
  const fetcher = kind === "cover-letter" ? getCoverLetterVersion : getResumeVersion;
  return fetcher(docId, version).then((res) => {
    contentCache.set(key, res);
    return res;
  });
}

/**
 * True when a built preview actually carries visible document content — so a
 * render that came back as an empty shell (a version with no saved text) is
 * treated as "no text" rather than painted as a blank page.
 */
export function hasRenderableContent(
  kind: VersionKind,
  data: VersionPreviewData | null
): boolean {
  if (!data) return false;
  if (kind === "cover-letter") {
    return !isEmptyCoverLetter(data as CoverLetterStructured);
  }
  const r = data as JsonResume;
  const b = r.basics ?? {};
  return Boolean(
    b.name?.trim() ||
      b.label?.trim() ||
      b.summary?.trim() ||
      (r.work?.length ?? 0) > 0 ||
      (r.education?.length ?? 0) > 0 ||
      (r.skills?.length ?? 0) > 0 ||
      (r.projects?.length ?? 0) > 0
  );
}

/** Session cache of fetched version renders (server-authoritative), so scrolling back never refetches. */
const renderCache = new Map<string, { markdown: string; template: string }>();

/**
 * Fetch one saved version's FULL raw markdown AND the template the server
 * rendered it with, through the server-authoritative render endpoint
 * (`/versions/{version}/render` → `{ template, data, markdown }`). `template_id`
 * is deliberately OMITTED so the SERVER resolves the template the version is
 * actually saved on — the DURABLE source of a version's design, not a
 * browser-local guess. The response's markdown is the version's own full text,
 * so the previews render THAT directly — never the sparse structured `data`.
 * Memoized per kind:id:version.
 */
function loadVersionRender(
  kind: VersionKind,
  docId: string | number,
  version: string | number,
  templateHint?: string
): Promise<{ markdown: string; template: string }> {
  // The version's own saved `template_id` is part of the cache key, so the
  // moment a version is re-designed its cached render is bypassed and re-fetched
  // with the new design — the change shows immediately, with no stale paint.
  const key = `render:${kind}:${docId}:${version}:${templateHint ?? ""}`;
  const cached = renderCache.get(key);
  if (cached) return Promise.resolve(cached);
  const fetching = (
    kind === "cover-letter"
      ? getCoverLetterVersionRender(docId, version)
      : getResumeVersionRender(docId, version)
  ).then((res) => ({
    markdown: asString(res.markdown),
    template: asText(res.template),
  }));
  return fetching.then((result) => {
    renderCache.set(key, result);
    return result;
  });
}

/**
 * Drop the session-cached content + render for ONE version so the next read
 * re-fetches fresh. Call this right after a version's design changes (its
 * per-version render must be re-read to pick up the new template) so the viewer,
 * the marquee thumbnail and the lightbox all repaint from the new design instead
 * of a cached one.
 */
export function invalidateVersionPreview(
  kind: VersionKind,
  docId: string | number,
  version: string | number
): void {
  contentCache.delete(cacheKey(kind, docId, version));
  const prefix = `render:${kind}:${docId}:${version}:`;
  for (const key of Array.from(renderCache.keys())) {
    if (key.startsWith(prefix)) renderCache.delete(key);
  }
}

/**
 * Resolve one saved version's content, ready to render, for the marquee thumbnail
 * AND the full-size lightbox. The server-authoritative
 * `/versions/{version}/render` endpoint is the preferred source (the same one the
 * My Work Highlights viewer uses); only if that fails (or the version has no text
 * at all) does it fall back to the version's OWN text — the text the record
 * already carries, else a lazy per-version fetch — parsed client-side. Either way
 * it yields the same `{ data, fingerprint, loaded, source }` state for the card,
 * and the document's active body is never used.
 */
export default function useVersionPreview(
  kind: VersionKind,
  docId: string | number,
  version: DocumentVersion,
  enabled: boolean,
  fallbackThemeId?: string | null
): VersionPreviewState {
  const versionId = version.version;
  const embedded = versionEmbeddedText(version);
  // This version's own saved design (empty = inherit the document's). It is the
  // durable, server-carried source of the version's design, used to resolve the
  // style and to key the render cache so a re-design re-fetches at once.
  const versionTemplateId = asText(version.template_id);
  // The template the SERVER rendered this version with — the durable source of
  // its design, used when nothing is saved locally on this device.
  const [serverTemplate, setServerTemplate] = useState<string | null>(null);

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [source, setSource] = useState<"server" | "text" | null>(null);

  // The style this version actually renders with. An explicitly-saved choice on
  // this device wins; otherwise the server-authoritative template (durable);
  // otherwise the document's own template / the built-in default.
  const style = resolveVersionPreviewStyle(
    kind,
    docId,
    versionId,
    serverTemplate || versionTemplateId || fallbackThemeId
  );

  // Once the card is in view (or its lightbox is open) resolve THIS version's raw
  // text. The server-authoritative `/versions/{version}/render` endpoint is the
  // preferred source — its response now carries the version's FULL markdown, so
  // the preview paints the actual résumé text rather than sparse structured data
  // (which can be near-empty for a plainly-formatted / docx-extracted document).
  // If it yields nothing, the version's OWN captured text is used (always scoped
  // to this version, never the document's active body). Either way the preview
  // paints real content — never a blank box.
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        let text = "";
        let from: "server" | "text" = "text";

        // 1. Server-authoritative render — now carrying the version's markdown
        //    AND the template the server rendered it with.
        try {
          const rendered = await loadVersionRender(
            kind,
            docId,
            versionId,
            versionTemplateId
          );
          if (!alive) return;
          if (rendered.template) setServerTemplate(asText(rendered.template));
          if (rendered.markdown.trim()) {
            text = rendered.markdown;
            from = "server";
          }
        } catch {
          /* fall through to the version's own text below */
        }

        // 2. The version's OWN text (embedded, else fetched) — version-scoped, so
        //    it can never be the document's active body.
        if (!text.trim()) {
          let own = embedded;
          if (!own) {
            const res = await loadVersionContent(kind, docId, versionId);
            own = versionContentText(res);
          }
          if (own.trim()) {
            text = own;
            from = "text";
          }
        }

        if (!alive) return;
        // 3. Truly empty → the honest "no content yet" state (never a blank box).
        setMarkdown(text.trim() ? text : null);
        setFingerprint(text.trim() ? contentFingerprint(text) : null);
        setSource(text.trim() ? from : null);
        setLoaded(true);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [embedded, enabled, kind, docId, versionId, versionTemplateId]);

  return { markdown, fingerprint, style, loading, loaded, error, source };
}

/**
 * One version's resolved content: its raw text plus a whitespace-insensitive
 * signature, so the strip can compare every version against the current one.
 */
export interface ResolvedVersionContent {
  text: string;
  fingerprint: string | null;
  /** True once resolution finished (embedded text is instant; else after a fetch). */
  loaded: boolean;
  error: boolean;
}

/** Seed a version's content from the text its record already carries (if any). */
function seedContent(version: DocumentVersion): ResolvedVersionContent {
  const embedded = versionEmbeddedText(version);
  if (embedded) {
    return {
      text: embedded,
      fingerprint: contentFingerprint(embedded) || null,
      loaded: true,
      error: false,
    };
  }
  return { text: "", fingerprint: null, loaded: false, error: false };
}

/**
 * Resolve EVERY version's raw text for a document in one place, so the strip can
 * power its "hide identical" filter and its per-card "N sections changed" count.
 * Embedded text (the common case) resolves synchronously with no request; a
 * metadata-only version resolves through the shared session cache — the same one
 * the thumbnails read — so nothing is ever fetched twice. Keyed by `version`.
 */
export function useVersionContentMap(
  kind: VersionKind,
  docId: string | number,
  versions: DocumentVersion[]
): Map<string, ResolvedVersionContent> {
  // A signature of the version set (id + embedded-or-not) restarts resolution
  // only when the versions genuinely change, not on every parent render.
  const signature = versions
    .map((v) => `${String(v.version)}:${versionEmbeddedText(v) ? 1 : 0}`)
    .join("|");

  const [map, setMap] = useState<Map<string, ResolvedVersionContent>>(
    () => new Map(versions.map((v) => [String(v.version), seedContent(v)]))
  );
  const startedRef = useRef<Set<string>>(new Set());
  const scopeRef = useRef(`${kind}:${docId}`);

  // A different document is a fresh scope — forget which versions we fetched.
  useEffect(() => {
    const scope = `${kind}:${docId}`;
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      startedRef.current = new Set();
    }
  }, [kind, docId]);

  // Reseed from embedded text whenever the version set changes, keeping any text
  // already fetched for the metadata-only versions still present.
  useEffect(() => {
    setMap((prev) => {
      const next = new Map<string, ResolvedVersionContent>();
      for (const v of versions) {
        const key = String(v.version);
        const seeded = seedContent(v);
        if (seeded.loaded) {
          next.set(key, seeded);
        } else {
          const existing = prev.get(key);
          next.set(key, existing && existing.loaded ? existing : seeded);
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Fetch every metadata-only version exactly once (session-cached upstream).
  useEffect(() => {
    let alive = true;
    for (const v of versions) {
      const key = String(v.version);
      if (versionEmbeddedText(v)) continue;
      if (startedRef.current.has(key)) continue;
      startedRef.current.add(key);
      loadVersionContent(kind, docId, v.version)
        .then((res) => {
          if (!alive) return;
          const text = versionContentText(res);
          setMap((prev) => {
            const next = new Map(prev);
            next.set(key, {
              text,
              fingerprint: contentFingerprint(text) || null,
              loaded: true,
              error: false,
            });
            return next;
          });
        })
        .catch(() => {
          if (!alive) return;
          setMap((prev) => {
            const next = new Map(prev);
            next.set(key, { text: "", fingerprint: null, loaded: true, error: true });
            return next;
          });
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, kind, docId]);

  return map;
}