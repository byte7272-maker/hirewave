/**
 * Typeface options for the saved-style "variation" picker. A saved look is a
 * layout + accent + font, so one layout can ship several named variations — a
 * warm serif cut beside a clean sans, for example.
 *
 * Only fonts already loaded by the app (Fraunces, Inter, JetBrains Mono) plus
 * universally-available system serifs/sans are offered, so a variation renders
 * identically everywhere without another network request. The chosen stack is
 * applied to the paper through the `--doc-font` CSS variable.
 */

export interface DocFont {
  id: string;
  name: string;
  description: string;
  /** Full font-family stack applied to the paper. */
  stack: string;
}

export const DOC_FONTS: DocFont[] = [
  {
    id: "inter",
    name: "Inter",
    description: "Modern neutral sans",
    stack: "'Inter', system-ui, -apple-system, sans-serif",
  },
  {
    id: "grotesk",
    name: "Neo Grotesk",
    description: "Tight geometric sans",
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  {
    id: "fraunces",
    name: "Fraunces",
    description: "Warm editorial serif",
    stack: "'Fraunces', Georgia, serif",
  },
  {
    id: "georgia",
    name: "Georgia",
    description: "Classic book serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: "times",
    name: "Times",
    description: "Formal traditional serif",
    stack: "'Times New Roman', Times, serif",
  },
  {
    id: "mono",
    name: "Mono",
    description: "Technical monospace",
    stack: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  },
];

export const DEFAULT_FONT_ID = "inter";

/** Resolve a font by id, falling back to the default for unknown/missing ids. */
export function getFont(id: string | undefined): DocFont {
  return DOC_FONTS.find((f) => f.id === id) ?? DOC_FONTS[0];
}

/** True when the id is one of the known fonts (used to validate stored choices). */
export function isKnownFont(id: string): boolean {
  return DOC_FONTS.some((f) => f.id === id);
}