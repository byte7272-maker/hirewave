import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_FONT_ID } from "@/pages/dashboard/documents/templates/styleFonts";

/**
 * The "signature" look baked into each cover-letter template — the accent and
 * typeface it ships with before the user tunes anything. Cover-letter templates
 * don't declare these on their own (unlike résumé templates), so this small map
 * derives them from each template's actual JSX: the traditional covers are set
 * in a Georgia serif, the rest in a neutral sans, and every one opens on the
 * stock accent. It powers the chooser's gallery (each card shows its template's
 * own look) and the preview header's "Customized" deltas.
 */

/** The typeface each cover-letter template is designed around. */
const SIGNATURE_FONT: Record<string, string> = {
  modern: "inter",
  minimal: "inter",
  sidebar: "inter",
  banner: "inter",
  classic: "georgia",
  elegant: "georgia",
};

export interface CoverLetterSignature {
  accentId: string;
  fontId: string;
}

/** The accent + typeface a cover-letter template looks like out of the box. */
export function coverLetterSignature(themeId: string): CoverLetterSignature {
  return {
    accentId: DEFAULT_ACCENT.id,
    fontId: SIGNATURE_FONT[themeId] ?? DEFAULT_FONT_ID,
  };
}