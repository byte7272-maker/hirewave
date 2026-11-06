import { useId, useMemo } from "react";
import { getAccent } from "./accent";
import { getFont } from "./styleFonts";
import { PAPER_MIN_HEIGHT, PAPER_WIDTH } from "./themes/paper";
import {
  buildDocumentCss,
  markdownToHtml,
  resolveHeadingStyle,
  type VersionDocStyle,
} from "./markdownDocument";

interface VersionMarkdownPreviewProps {
  /** The version's FULL raw text — always present when there's any content. */
  markdown: string;
  /** The template layout id (drives the heading treatment). */
  themeId: string;
  /** The saved accent id. */
  accentId: string;
  /** The saved font id. */
  fontId?: string;
  /**
   * Display width. At or above {@link PAPER_WIDTH} the sheet renders at its
   * natural size (the readable lightbox); below it the sheet is scaled down to
   * fit (the marquee thumbnails / viewer preview).
   */
  width?: number;
  /** Display height for the scaled frame. */
  height?: number;
  className?: string;
}

/**
 * A version rendered straight from its raw markdown, styled with the template's
 * font family, accent color and heading treatment. This is the shared preview
 * behind the My Work Highlights viewer, the marquee thumbnails and the full-size
 * lightbox — so a saved version always shows its résumé text, even when the
 * structured data is sparse or empty.
 *
 * Below the natural A4 width the sheet is scaled (not reflowed) into a clipped
 * frame, exactly like the design-thumbnail renderer, so a mini preview reads the
 * same as the full-size one.
 */
export default function VersionMarkdownPreview({
  markdown,
  themeId,
  accentId,
  fontId,
  width = PAPER_WIDTH,
  height,
  className = "",
}: VersionMarkdownPreviewProps) {
  const accent = getAccent(accentId);
  const font = getFont(fontId);
  // Scope the injected CSS to this instance so two previews with different
  // accents can sit on the page at once without overriding each other.
  const rawId = useId();
  const scope = useMemo(() => `vd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`, [rawId]);

  const style: VersionDocStyle = useMemo(
    () => ({
      fontStack: font.stack,
      accent: accent.value,
      accentSoft: accent.soft,
      accentDark: accent.dark,
      headingStyle: resolveHeadingStyle(themeId),
    }),
    [font.stack, accent.value, accent.soft, accent.dark, themeId]
  );

  const css = useMemo(() => buildDocumentCss(scope, style), [scope, style]);
  const html = useMemo(() => markdownToHtml(markdown), [markdown]);

  const paper = (
    <div
      className={scope}
      style={{
        background: "#ffffff",
        color: "#111827",
        fontFamily: font.stack,
        padding: "54px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <style>{css}</style>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          This version has no content yet.
        </p>
      )}
    </div>
  );

  // Natural size — the readable lightbox scales this itself via its FitPane.
  if (width >= PAPER_WIDTH) {
    return <div className={className}>{paper}</div>;
  }

  // Scaled — a mini page inside a clipped frame, matching the design thumbnails.
  const scale = width / PAPER_WIDTH;
  const frameHeight = height ?? Math.round(PAPER_MIN_HEIGHT * scale);
  return (
    <div
      className={`relative flex-shrink-0 rounded-md border border-background-200 bg-white overflow-hidden ${className}`}
      style={{ width, height: frameHeight }}
    >
      <div
        className="origin-top-left pointer-events-none select-none"
        style={{
          width: PAPER_WIDTH,
          minHeight: PAPER_MIN_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {paper}
      </div>
    </div>
  );
}