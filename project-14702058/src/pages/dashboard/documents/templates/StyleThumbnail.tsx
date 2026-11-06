import type { CSSProperties } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { LibraryStyleKind } from "@/lib/styleLibrary";
import { getAccent } from "./accent";
import { getFont } from "./styleFonts";
import { getTheme } from "./themeRegistry";
import { getCoverLetterTheme } from "./coverLetterThemeRegistry";
import { PAPER_MIN_HEIGHT, PAPER_WIDTH } from "./themes/paper";

interface StyleThumbnailProps {
  kind: LibraryStyleKind;
  themeId: string;
  accentId: string;
  fontId?: string;
  /** The live document used to fill the thumbnail (null shows a placeholder glyph). */
  data: JsonResume | CoverLetterStructured | null;
  width?: number;
  height?: number;
}

/**
 * A tiny, live render of a saved style — the actual template filled with the
 * user's document, scaled down inside a clipped frame. It shows the real look at
 * a glance instead of a name-only row. The chosen font is applied via the
 * `--doc-font` variable so it matches what applying the style would produce.
 */
export default function StyleThumbnail({
  kind,
  themeId,
  accentId,
  fontId,
  data,
  width = 60,
  height = 84,
}: StyleThumbnailProps) {
  const accent = getAccent(accentId);
  const font = getFont(fontId);
  const scale = width / PAPER_WIDTH;
  const paperHeight = Math.max(height, PAPER_MIN_HEIGHT * scale);
  const wrapperStyle = { width, height, "--doc-font": font.stack } as CSSProperties;

  let paper = null;
  if (data) {
    if (kind === "resume") {
      const theme = getTheme(themeId);
      paper = <theme.Component resume={data as JsonResume} accent={accent} />;
    } else {
      const theme = getCoverLetterTheme(themeId);
      paper = <theme.Component data={data as CoverLetterStructured} accent={accent} />;
    }
  }

  return (
    <div
      className="hw-doc-font relative flex-shrink-0 rounded-md border border-background-200 bg-white overflow-hidden"
      style={wrapperStyle}
      aria-hidden="true"
    >
      {paper ? (
        <div
          className="origin-top-left pointer-events-none select-none"
          style={{ width: PAPER_WIDTH, height: paperHeight, transform: `scale(${scale})` }}
        >
          {paper}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-foreground-400">
          <i className="ri-layout-masonry-line"></i>
        </div>
      )}
    </div>
  );
}