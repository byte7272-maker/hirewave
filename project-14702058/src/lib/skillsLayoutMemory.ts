/**
 * Per-document preference for how the Skills section is PRESENTED — either one
 * comma-separated line or a bulleted list.
 *
 * This is a pure template/display choice, NOT document content: flipping it
 * re-renders the Skills section locally and never calls the AI. It is stored per
 * document (like the template / accent memory) so a résumé reopens with the same
 * Skills presentation the user last chose.
 */

export type SkillsLayout = "comma" | "bullets";

const KEY_PREFIX = "hirewave_skills_layout_";

function storageKey(docId: string | number): string {
  return `${KEY_PREFIX}${docId}`;
}

/** Read a document's remembered Skills presentation (defaults to a comma list). */
export function readSkillsLayout(docId: string | number): SkillsLayout {
  try {
    return localStorage.getItem(storageKey(docId)) === "bullets" ? "bullets" : "comma";
  } catch {
    return "comma";
  }
}

/** Remember a document's Skills presentation. */
export function writeSkillsLayout(docId: string | number, layout: SkillsLayout): void {
  try {
    localStorage.setItem(storageKey(docId), layout);
  } catch {
    /* a display preference only — a storage failure just means it won't persist */
  }
}

/** The selectable Skills presentations, for the toggle control. */
export const SKILLS_LAYOUT_OPTIONS: { id: SkillsLayout; label: string; icon: string }[] = [
  { id: "comma", label: "Comma list", icon: "ri-text-wrap" },
  { id: "bullets", label: "Bulleted", icon: "ri-list-unordered" },
];