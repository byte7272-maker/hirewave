/**
 * Field-level diffing for the structured AI preview.
 *
 * The text preview (`ImprovePreview`) works word-by-word; the structured preview
 * needs the same "revert just this edit" ability at the granularity the AI
 * actually works at — a field. So both the résumé and cover-letter previews
 * flatten their structured object into a flat list of leaf fields, diff those
 * lists, and let the user keep or revert each changed field independently.
 *
 * Paths use the JSON-Resume style notation the templates already use for metric
 * highlighting (`work[0].highlights[1]`, `basics.summary`), so a reverted field
 * and its flagged metric refer to the same location.
 */

/** One leaf of a structured document: a path, a human label, and its text. */
export interface FlatField {
  path: string;
  /** Human label shown in the review list, e.g. "Northwind Analytics — highlight 2". */
  label: string;
  /** Coarse section name, e.g. "Experience". */
  section: string;
  /** The leaf's value as display text ("" when empty). */
  value: string;
}

/** A difference between the current document and the improved one. */
export interface StructuredChange {
  id: number;
  path: string;
  label: string;
  section: string;
  kind: "added" | "edited" | "removed";
  /** The current (original) wording — "" for an addition. */
  before: string;
  /** The improved wording — "" for a removal. */
  after: string;
}

type Seg = string | number;

/** Parse "work[0].highlights[1]" into ["work", 0, "highlights", 1]. */
function parsePath(path: string): Seg[] {
  const segs: Seg[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) segs.push(match[1]);
    else if (match[2] !== undefined) segs.push(Number(match[2]));
  }
  return segs;
}

/** Read a nested value by path. */
export function getPath(obj: unknown, path: string): unknown {
  let cur = obj as Record<Seg, unknown> | undefined;
  for (const seg of parsePath(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<Seg, unknown>)[seg];
  }
  return cur;
}

/** Write a nested value by path, creating intermediate arrays/objects as needed. */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = parsePath(path);
  let cur = obj as Record<Seg, unknown>;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const seg = segs[i];
    if (cur[seg] === null || cur[seg] === undefined) {
      cur[seg] = typeof segs[i + 1] === "number" ? [] : {};
    }
    cur = cur[seg] as Record<Seg, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

/** Remove a nested value by path (splicing array elements rather than leaving a hole). */
export function deletePath(obj: Record<string, unknown>, path: string): void {
  const segs = parsePath(path);
  let cur = obj as Record<Seg, unknown> | undefined;
  for (let i = 0; i < segs.length - 1; i += 1) {
    if (cur === null || cur === undefined) return;
    cur = cur[segs[i]] as Record<Seg, unknown> | undefined;
  }
  if (cur === null || cur === undefined) return;
  const last = segs[segs.length - 1];
  if (typeof last === "number" && Array.isArray(cur)) cur.splice(last, 1);
  else delete cur[last];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Diff two flattened field lists into an ordered set of changes. Iterating the
 * "after" list keeps changes in document order; removals are appended last.
 */
export function diffFields(before: FlatField[], after: FlatField[]): StructuredChange[] {
  const beforeMap = new Map(before.map((f) => [f.path, f]));
  const afterMap = new Map(after.map((f) => [f.path, f]));
  const changes: StructuredChange[] = [];

  for (const f of after) {
    const b = beforeMap.get(f.path);
    if (!b) {
      if (f.value.trim()) {
        changes.push({
          id: changes.length,
          path: f.path,
          label: f.label,
          section: f.section,
          kind: "added",
          before: "",
          after: f.value,
        });
      }
    } else if (b.value !== f.value) {
      changes.push({
        id: changes.length,
        path: f.path,
        label: f.label,
        section: f.section,
        kind: "edited",
        before: b.value,
        after: f.value,
      });
    }
  }

  for (const b of before) {
    if (!afterMap.has(b.path) && b.value.trim()) {
      changes.push({
        id: changes.length,
        path: b.path,
        label: b.label,
        section: b.section,
        kind: "removed",
        before: b.value,
        after: "",
      });
    }
  }

  return changes;
}

/**
 * Build the structured object that reflects the user's keep/revert choices:
 * start from the improved document, then for every reverted change restore the
 * original wording (or drop an AI addition entirely).
 */
export function resolveByReverts<T>(
  improved: T,
  before: T,
  changes: StructuredChange[],
  reverted: ReadonlySet<number>
): T {
  if (reverted.size === 0) return improved;
  const clone = deepClone(improved) as Record<string, unknown>;
  for (const change of changes) {
    if (!reverted.has(change.id)) continue;
    if (change.kind === "added") {
      deletePath(clone, change.path);
    } else {
      setPath(clone, change.path, change.before);
    }
  }
  return clone as T;
}