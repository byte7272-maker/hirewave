import type { FlaggedMetric } from "@/lib/documents";

/**
 * Normalize a JSON path so the same location matches regardless of notation.
 * "work[0].highlights[1]", "work.0.highlights.1" and "work[0].highlights.1"
 * all collapse to "work.0.highlights.1".
 */
export function normalizeFieldPath(path: string | undefined): string {
  if (!path) return "";
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .trim();
}

/** The distinct flagged values that belong to a given field path. */
export function flagsForField(
  flags: FlaggedMetric[] | undefined,
  field: string
): string[] {
  if (!flags || flags.length === 0) return [];
  const target = normalizeFieldPath(field);
  const values: string[] = [];
  for (const flag of flags) {
    if (!flag.value || !flag.value.trim()) continue;
    if (normalizeFieldPath(flag.field) === target) values.push(flag.value);
  }
  return values;
}

/** Escape a string so it can be embedded literally in a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}