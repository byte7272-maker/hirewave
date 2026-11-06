import type { JsonResumeSkill } from "@/lib/jsonResume";

/**
 * The canonical Skills presentation — ONE flat, de-duplicated, order-preserving
 * comma-separated list (e.g. "Python, AWS, Kafka, leadership, distributed systems").
 *
 * Résumés store skills as `{ name, keywords[] }` groups, which is handy as data
 * but rendered inconsistently: some themes bulleted, some grouped, some pilled.
 * Worse, the markdown serializer that produces the saved text used to emit one
 * bullet per group — so a saved revision "reverted" to bullets even when the
 * preview (and the user's instruction) asked for a comma list.
 *
 * Every résumé theme AND the markdown serializer now build the section from the
 * SAME list, so the preview and the saved render can never drift apart.
 */

/** Flatten a résumé's skill groups into a de-duplicated, order-preserving list. */
export function skillsToItems(skills?: JsonResumeSkill[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of skills ?? []) {
    for (const raw of [skill.name, ...(skill.keywords ?? [])]) {
      const value = (raw === null || raw === undefined ? "" : String(raw)).trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

/** The Skills section joined into a single comma-separated inline line. */
export function skillsInlineText(skills?: JsonResumeSkill[]): string {
  return skillsToItems(skills).join(", ");
}