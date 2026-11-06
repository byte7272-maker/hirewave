/**
 * Turn a document change into a plain-language confirmation that NAMES the real
 * action and the section(s) it touched — so the bottom flash reads
 * "Rephrased Summary" or "Improved Summary and Experience" instead of a generic
 * "Saved" / "Updated" line.
 *
 * Shared by the editors, the quick preview and the templates panels, so every
 * "what just happened" message is worded the same way everywhere.
 */
import { detectSections } from "@/lib/docSections";

/**
 * Join section names into a readable list:
 * "Summary" / "Summary and Experience" / "Summary, Skills and Experience".
 * Duplicates and blanks are dropped.
 */
export function joinSectionNames(sections: string[]): string {
  const unique: string[] = [];
  for (const raw of sections) {
    const name = (raw ?? "").trim();
    if (name && !unique.includes(name)) unique.push(name);
  }
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/**
 * Build the flash message: `"{verb} {sections}."` when the sections are known,
 * otherwise the supplied fallback. `verb` may include a preposition, e.g.
 * `"Applied to"` → `"Applied to Summary."`.
 */
export function describeAction(
  verb: string,
  sections: string[],
  fallback: string
): string {
  const label = joinSectionNames(sections);
  return label ? `${verb} ${label}.` : fallback;
}

/** The section a snippet of document text belongs to ("" when it can't be found). */
export function sectionForSnippet(text: string, snippet: string): string {
  const needle = (snippet ?? "").trim().slice(0, 80);
  if (!needle) return "";
  const at = text.indexOf(needle);
  if (at < 0) return "";
  let found = "";
  for (const section of detectSections(text)) {
    if (section.start <= at) found = section.title;
    else break;
  }
  return found;
}

/**
 * The first section whose body differs between two documents — used to name the
 * part an inline edit (a typed change or a rephrase) actually changed.
 * Returns "" when nothing differs or no section carries the change.
 */
export function findChangedSection(prevText: string, nextText: string): string {
  const prev = detectSections(prevText);
  const next = detectSections(nextText);
  const count = Math.max(prev.length, next.length);
  for (let i = 0; i < count; i += 1) {
    const before = prev[i]?.body ?? "";
    const after = next[i]?.body ?? "";
    if (before !== after) {
      return (next[i]?.title ?? prev[i]?.title ?? "").trim();
    }
  }
  return "";
}