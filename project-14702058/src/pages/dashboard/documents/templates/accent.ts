/**
 * A small, curated accent palette shared by the résumé and cover-letter template
 * renderers. Each template takes one of these and uses it sparingly — a rule,
 * a small-caps label, skill pills — so the layout stays the star.
 *
 * Default is the spec's cobalt (#2563eb) used by TemplateModern.
 */

export interface AccentColor {
  id: string;
  name: string;
  /** Primary accent used for rules, labels and pills. */
  value: string;
  /** Very light tint used for pill backgrounds. */
  soft: string;
  /** Darker shade for accent text on the light tint. */
  dark: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: "cobalt", name: "Cobalt", value: "#2563eb", soft: "#eff6ff", dark: "#1d4ed8" },
  { id: "emerald", name: "Emerald", value: "#059669", soft: "#ecfdf5", dark: "#047857" },
  { id: "amber", name: "Amber", value: "#d97706", soft: "#fffbeb", dark: "#b45309" },
  { id: "rose", name: "Rose", value: "#e11d48", soft: "#fff1f2", dark: "#be123c" },
  { id: "teal", name: "Teal", value: "#0d9488", soft: "#f0fdfa", dark: "#0f766e" },
  { id: "graphite", name: "Graphite", value: "#334155", soft: "#f1f5f9", dark: "#1e293b" },
];

export const DEFAULT_ACCENT: AccentColor = ACCENT_COLORS[0];

export function getAccent(id: string | undefined): AccentColor {
  return ACCENT_COLORS.find((a) => a.id === id) ?? DEFAULT_ACCENT;
}

/** True when the id is one of the known accents (used to validate stored choices). */
export function isKnownAccent(id: string): boolean {
  return ACCENT_COLORS.some((a) => a.id === id);
}