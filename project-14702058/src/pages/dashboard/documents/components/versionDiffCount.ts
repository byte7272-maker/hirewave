/**
 * Section-level diffing between a saved version and the current version.
 *
 * The version cards show a compact "N sections changed" chip, and hovering that
 * chip lists WHICH sections differ. So we slice a document's canonical text into
 * sections and report both the count and the section names.
 *
 * A résumé's markdown has top-level `## Heading` sections (Summary, Experience,
 * Education, Skills, …); each `### Role` line stays inside its parent section, so
 * a single edited bullet counts as ONE changed section. A document with no
 * headings (e.g. a cover letter) falls back to blank-line paragraphs.
 */

export interface SectionDiff {
  /** How many sections differ (added, removed, or edited) between the two texts. */
  changed: number;
  /** How many sections were considered in total (union of both sides). */
  total: number;
  /** True when the two texts are equal once whitespace is normalized. */
  identical: boolean;
  /**
   * The display names of the sections that differ, in reading order (the current
   * document's order first, then any sections only the other side carries). This
   * is what the card's hover popover and the compare view list.
   */
  changedSections: string[];
}

interface Section {
  /** Normalized match key (lowercased heading). */
  key: string;
  /** Human-readable label for display (the heading as written). */
  label: string;
  text: string;
}

/** Collapse all whitespace so reflow / line-wrap noise never counts as a change. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Split a document's text into its top-level sections (or paragraphs). */
function splitSections(input: string): Section[] {
  const text = (input ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const hasHeadings = lines.some((line) => /^##(?!#)\s+/.test(line.trim()));

  if (!hasHeadings) {
    let blocks = text
      .split(/\n\s*\n/)
      .map(normalize)
      .filter(Boolean);
    if (blocks.length <= 1) {
      blocks = text
        .split(/\n/)
        .map(normalize)
        .filter(Boolean);
    }
    if (blocks.length <= 1) {
      return blocks.length ? [{ key: "Body", label: "Body", text: blocks[0] }] : [];
    }
    return blocks.map((body, i) => ({
      key: `Paragraph ${i + 1}`,
      label: `Paragraph ${i + 1}`,
      text: body,
    }));
  }

  const sections: Section[] = [];
  let currentKey = "Header";
  let currentLabel = "Header";
  let buffer: string[] = [];
  let headingCount = 0;

  const flush = () => {
    sections.push({
      key: currentKey,
      label: currentLabel,
      text: normalize(buffer.join("\n")),
    });
    buffer = [];
  };

  for (const raw of lines) {
    const heading = /^##(?!#)\s+(.*)$/.exec(raw.trim());
    if (heading) {
      flush();
      headingCount += 1;
      const title = normalize(heading[1]);
      currentKey = title.toLowerCase() || `Section ${headingCount}`;
      currentLabel = title || `Section ${headingCount}`;
      continue;
    }
    buffer.push(raw);
  }
  flush();

  // Drop an empty leading header (a document that opens straight into `## …`).
  return sections.filter((s) => s.text !== "" || s.key !== "Header");
}

/** Map sections to key → { label, text }, disambiguating repeated headings. */
function toSectionMap(sections: Section[]): Map<string, { label: string; text: string }> {
  const map = new Map<string, { label: string; text: string }>();
  const seen = new Map<string, number>();
  for (const s of sections) {
    const n = (seen.get(s.key) ?? 0) + 1;
    seen.set(s.key, n);
    const key = n > 1 ? `${s.key}#${n}` : s.key;
    const label = n > 1 ? `${s.label} (${n})` : s.label;
    map.set(key, { label, text: s.text });
  }
  return map;
}

/**
 * Compare a saved version's text against the current version's text section by
 * section. Identical text yields `{ changed: 0, identical: true, changedSections: [] }`.
 */
export function countChangedSections(before: string, after: string): SectionDiff {
  const beforeMap = toSectionMap(splitSections(before));
  const afterMap = toSectionMap(splitSections(after));

  // Reading order: the current (after) document first, then sections that only
  // exist on the other side — so the list reads like the document itself.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const key of afterMap.keys()) {
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  for (const key of beforeMap.keys()) {
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }

  const changedSections: string[] = [];
  for (const key of order) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if ((b?.text ?? "") !== (a?.text ?? "")) {
      changedSections.push((a ?? b)?.label ?? key);
    }
  }

  return {
    changed: changedSections.length,
    total: order.length,
    identical: normalize(before) === normalize(after),
    changedSections,
  };
}