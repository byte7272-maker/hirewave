import type { ResumeTemplate, ResumeTemplateFontFamily } from "@/lib/documents";
import {
  getTheme,
  type ResumeTheme,
} from "@/pages/dashboard/documents/templates/themeRegistry";
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  isKnownAccent,
} from "@/pages/dashboard/documents/templates/accent";
import {
  DEFAULT_FONT_ID,
  isKnownFont,
} from "@/pages/dashboard/documents/templates/styleFonts";

/** The concrete typeface a font family maps to, drawn from the loaded fonts. */
const FAMILY_FONT_ID: Record<ResumeTemplateFontFamily, string> = {
  sans: "inter",
  serif: "georgia",
  mono: "mono",
};

/**
 * Resolve a template's accent to a known accent id. The API may send either an
 * accent id or a raw hex, so both are accepted (a hex is matched to the closest
 * curated accent; anything unknown falls back to the default).
 */
export function resolveTemplateAccentId(accentColor: string | undefined): string {
  if (accentColor && isKnownAccent(accentColor)) return accentColor;
  const hex = (accentColor ?? "").trim().toLowerCase();
  if (hex) {
    const match = ACCENT_COLORS.find((a) => a.value.toLowerCase() === hex);
    if (match) return match.id;
  }
  return DEFAULT_ACCENT.id;
}

/** The concrete typeface id a template ships with. */
export function resolveTemplateFontId(template: ResumeTemplate): string {
  const family = template.style?.font_family;
  const id = family ? FAMILY_FONT_ID[family] : undefined;
  return id && isKnownFont(id) ? id : DEFAULT_FONT_ID;
}

/** The layout component a template renders through. */
export function resolveTemplateTheme(template: ResumeTemplate): ResumeTheme {
  return getTheme(template.id);
}

/** A short, human label for a template's font family, for the card swatch. */
export function templateFontLabel(template: ResumeTemplate): string {
  const family = template.style?.font_family;
  if (family === "serif") return "Serif";
  if (family === "mono") return "Mono";
  return "Sans";
}