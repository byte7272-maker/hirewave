import { useEffect, useState } from "react";

/**
 * Per-document, per-SECTION text style — whether a named section reads **bold**
 * and/or **italic**.
 *
 * This is a pure DISPLAY preference (exactly like the Skills layout or the
 * template choice), NOT document content: changing it re-renders the section
 * locally and never round-trips the AI. It is stored per document AND per
 * version, so switching versions restores each one's own section styling and a
 * résumé / cover letter reopens with the same section styling it had.
 *
 * The AI "Ask AI to change it" box routes a formatting instruction such as
 * "remove bold from the education section" here (see `editRouting`), so a
 * formatting ask applies immediately instead of looking like a silent no-op.
 *
 * Rendering: `markdownToHtml` tags each `##` section with a
 * `data-hw-section="<key>"` attribute, and {@link injectSectionStyles} injects a
 * scoped `<style>` into the rendered document — so a viewer that subscribes to
 * the store (via {@link useSectionStyles}) repaints the moment a style flips.
 */

export interface SectionStyle {
  /** Whether the section (its heading + text) reads bold. Default: true. */
  bold: boolean;
  /** Whether the section reads italic. Default: false. */
  italic: boolean;
}

/** The style a section uses until the user changes it. */
export const DEFAULT_SECTION_STYLE: SectionStyle = { bold: true, italic: false };

/** A parsed formatting instruction: which section, and the bold/italic it wants. */
export interface SectionStyleTarget {
  section: string;
  bold?: boolean;
  italic?: boolean;
}

/** The sections offered by the control +(their display labels). */
export const SECTION_STYLE_SECTIONS: { key: string; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "experience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "skills", label: "Skills" },
  { key: "projects", label: "Projects" },
  { key: "certifications", label: "Certifications" },
  { key: "awards", label: "Awards" },
  { key: "languages", label: "Languages" },
];

const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  SECTION_STYLE_SECTIONS.map((s) => [s.key, s.label])
);

/** A friendly display label for a section key (falls back to title-casing it). */
export function sectionLabel(key: string): string {
  return (
    LABEL_BY_KEY[key] ??
    key
      .split("-")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

/** A plain-language confirmation for a section-style change, e.g. "Education section is now not bold". */
export function describeSectionStyleChange(
  section: string,
  bold: boolean | undefined,
  italic: boolean | undefined
): string {
  const label = sectionLabel(section);
  const parts: string[] = [];
  if (bold !== undefined) parts.push(bold ? "bold" : "not bold");
  if (italic !== undefined) parts.push(italic ? "italic" : "not italic");
  return `${label} section is now ${parts.join(" and ")}`;
}

/**
 * Canonical section keys, with the common heading spellings that resolve to each.
 * (Longest alias wins, so "professional summary" beats a bare "summary".)
 */
const HEADING_ALIASES: Record<string, string> = {
  summary: "summary",
  profile: "summary",
  objective: "summary",
  about: "summary",
  "professional summary": "summary",
  "career summary": "summary",
  "executive summary": "summary",
  experience: "experience",
  "work experience": "experience",
  "professional experience": "experience",
  "work history": "experience",
  employment: "experience",
  "relevant experience": "experience",
  education: "education",
  academics: "education",
  academic: "education",
  "education and training": "education",
  skills: "skills",
  "technical skills": "skills",
  "core skills": "skills",
  "core competencies": "skills",
  technologies: "skills",
  "areas of expertise": "skills",
  projects: "projects",
  "personal projects": "projects",
  "selected projects": "projects",
  certifications: "certifications",
  certificates: "certifications",
  licenses: "certifications",
  certifications_licenses: "certifications",
  awards: "awards",
  honors: "awards",
  honours: "awards",
  achievements: "awards",
  languages: "languages",
};

/** Normalise a heading / label for section matching (lowercase, alphanumeric). */
function normalizeHeadingText(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A normalized section label → its canonical key (used for exact matching). */
const ALIAS_BY_NORMALIZED: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [alias, key] of Object.entries(HEADING_ALIASES)) {
    map[normalizeHeadingText(alias)] = key;
  }
  return map;
})();

/** Every canonical section key — used to spot a section BOUNDARY on any page. */
export const KNOWN_SECTION_KEYS: ReadonlySet<string> = new Set(
  Object.values(HEADING_ALIASES)
);

/**
 * Resolve a heading's text to a canonical section key (e.g. "Education" →
 * `education`, "Work Experience" → `experience`). Unknown headings fall back to a
 * slug so a custom section can still be styled.
 */
export function sectionKeyForHeading(heading: string): string {
  const norm = normalizeHeadingText(heading);
  if (!norm) return "section";
  return HEADING_ALIASES[norm] ?? norm.replace(/\s+/g, "-");
}

/**
 * The canonical section key an EXACT label maps to (e.g. "EDUCATION" →
 * `education`), with NO slug fallback — so a passing mention of a section word is
 * only treated as that section when it genuinely matches a known label.
 */
export function exactSectionKey(text: string): string | null {
  const norm = normalizeHeadingText(text);
  if (!norm) return null;
  return ALIAS_BY_NORMALIZED[norm] ?? null;
}

// ---- Instruction parsing --------------------------------------------------

const ALIAS_ENTRIES = Object.keys(HEADING_ALIASES).sort((a, b) => b.length - a.length);

/** Find a mentioned section key in a lowercased instruction, or null. */
function findSectionKey(raw: string): string | null {
  for (const alias of ALIAS_ENTRIES) {
    const pattern = new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`);
    if (pattern.test(raw)) return HEADING_ALIASES[alias];
  }
  return null;
}

/**
 * Recognise a pure section-STYLE instruction — "remove bold from the education
 * section", "make experience italic", "unbold skills" — and return the target
 * section plus the bold / italic state it wants. Returns null for anything that
 * isn't a section formatting ask (so real rewrites still reach the AI).
 */
export function detectSectionStyleInstruction(text: string): SectionStyleTarget | null {
  const raw = (text ?? "").trim().toLowerCase();
  if (raw.length < 4) return null;
  const mentionsBold = /\bbold(ed|face)?\b/.test(raw);
  const mentionsItalic = /\bitalic(s|ize|ise|ized|ised)?\b/.test(raw);
  if (!mentionsBold && !mentionsItalic) return null;
  const section = findSectionKey(raw);
  if (!section) return null;
  // "remove / drop / no / not / un-bold" reads as OFF; otherwise ON.
  const off =
    /\b(remove|removing|removed|delete|deleting|drop|dropping|no|not|without|non-?bold|unbold\w*|turn off|switch off|off|get rid of|take out|strip|less)\b/.test(
      raw
    );
  const target: SectionStyleTarget = { section };
  if (mentionsBold) target.bold = !off;
  if (mentionsItalic) target.italic = !off;
  return target;
}

// ---- Store -----------------------------------------------------------------

const KEY_PREFIX = "hirewave_section_styles_";
const listeners = new Set<() => void>();
/** Stable per-document-and-version cache so React sees the same object until a real change. */
const cache = new Map<string, Record<string, SectionStyle>>();

/** The version slot: a non-empty version is remembered on its own, else document-level. */
function normalizeVersion(version: string | number | null | undefined): string {
  return version === null || version === undefined || String(version) === ""
    ? ""
    : String(version);
}

function storageKey(
  docId: string | number,
  version?: string | number | null
): string {
  const v = normalizeVersion(version);
  return v ? `${KEY_PREFIX}${docId}_v${v}` : `${KEY_PREFIX}${docId}`;
}

/** The in-memory cache / listener key for a document + version pair. */
function cacheKey(docId: string | number, version?: string | number | null): string {
  const v = normalizeVersion(version);
  return v ? `${docId}::${v}` : String(docId);
}

function parseStyles(raw: string | null): Record<string, SectionStyle> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<SectionStyle>>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SectionStyle> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      out[key] = {
        bold: value.bold === undefined ? DEFAULT_SECTION_STYLE.bold : Boolean(value.bold),
        italic: value.italic === undefined ? DEFAULT_SECTION_STYLE.italic : Boolean(value.italic),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Read a document (or one version's) section-style overrides (cached until they change). */
export function readSectionStyles(
  docId: string | number | null | undefined,
  version?: string | number | null
): Record<string, SectionStyle> {
  if (docId === null || docId === undefined || docId === "") return {};
  const key = cacheKey(docId, version);
  const cached = cache.get(key);
  if (cached) return cached;
  let value: Record<string, SectionStyle> = {};
  try {
    value = parseStyles(localStorage.getItem(storageKey(docId, version)));
  } catch {
    value = {};
  }
  cache.set(key, value);
  return value;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Replace a document's (or one version's) whole section-style map (persists + notifies viewers). */
export function writeSectionStyles(
  docId: string | number,
  version: string | number | null | undefined,
  styles: Record<string, SectionStyle>
): void {
  cache.set(cacheKey(docId, version), styles);
  try {
    localStorage.setItem(storageKey(docId, version), JSON.stringify(styles));
  } catch {
    /* a display preference only — a storage failure means it just won't persist */
  }
  emit();
}

/** Merge a patch into one section's style (the UI control + AI command both use this). */
export function setSectionStyle(
  docId: string | number,
  version: string | number | null | undefined,
  section: string,
  patch: Partial<SectionStyle>
): void {
  const current = readSectionStyles(docId, version);
  const prev = current[section] ?? DEFAULT_SECTION_STYLE;
  writeSectionStyles(docId, version, { ...current, [section]: { ...prev, ...patch } });
}

/** Subscribe to any section-style change (used by {@link useSectionStyles}). */
export function subscribeSectionStyles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The document's (or one version's) section-style overrides, re-rendering the
 * caller whenever a section style changes — so a viewer adds a
 * `data-hw-section`-scoped rule and repaints in place, with no props threaded
 * through the page.
 */
export function useSectionStyles(
  docId: string | number | null | undefined,
  version?: string | number | null
): Record<string, SectionStyle> {
  const [styles, setStyles] = useState<Record<string, SectionStyle>>(() =>
    readSectionStyles(docId, version)
  );
  useEffect(() => {
    setStyles(readSectionStyles(docId, version));
    return subscribeSectionStyles(() => setStyles(readSectionStyles(docId, version)));
  }, [docId, version]);
  return styles;
}

// ---- Rendering -------------------------------------------------------------

/** The scoped CSS that applies each section's bold / italic override. */
export function sectionStyleCss(styles: Record<string, SectionStyle>): string {
  const rules: string[] = [];
  for (const [key, style] of Object.entries(styles)) {
    const sel = `[data-hw-section="${key}"]`;
    if (!style.bold) {
      rules.push(`${sel},${sel} *{font-weight:400 !important;}`);
    }
    if (style.italic) {
      rules.push(`${sel},${sel} *{font-style:italic !important;}`);
    }
  }
  return rules.join("\n");
}

/** True for a heading element (h1–h6) in parsed HTML. */
function isHeadingElement(node: Node | null): node is Element {
  return !!node && node.nodeType === 1 && /^H[1-6]$/.test((node as Element).tagName);
}

/**
 * Tag a document's sections so a per-section style can target them, by reading
 * the section NAME from each section's title.
 *
 * This is what lets a section style work on a page we did NOT author ourselves.
 * The viewers paint the BACKEND's rendered `preview.html`, which — unlike our own
 * `markdownToHtml` — carries no `data-hw-section` markers and may nest a section's
 * body inside wrappers or layout tables. A rule scoped to the markers would match
 * nothing and the change would look like a silent no-op, so we add the markers
 * here, in DOCUMENT ORDER, to match the shape `markdownToHtml` produces.
 *
 * A section START is either a heading (h1–h6) whose text resolves to a known
 * section, OR a short, title-like element whose whole text is an exact section
 * label (some renderers emit section titles as styled div / td / strong, not
 * headings). From each start, every following element is marked as that section
 * up to the NEXT section start that isn't nested inside it — so wrapped and
 * table-cell content is covered, while a following section (with its own title)
 * is left for its own pass. HTML that already carries the markers is left as-is.
 */
/**
 * Tag a parsed document's sections so a per-section style can target them, by
 * reading the section NAME from each section's title.
 *
 * A section START is either a heading (h1–h6) whose text resolves to a known
 * section, OR a short, title-like element whose whole text is an exact section
 * label (some renderers emit section titles as styled div / td / strong, not
 * headings). From each start, every following element is marked as that section
 * up to the NEXT section start that isn't nested inside it — so wrapped and
 * table-cell content is covered, while a following section (with its own title)
 * is left for its own pass. Already-tagged elements are left as-is.
 *
 * Works on any element tree — a `DOMParser` document (the HTML injector) or a
 * live React subtree (the styled template preview).
 */
export function tagSectionsInElement(
  root: Element,
  styles: Record<string, SectionStyle>
): boolean {
  const keys = new Set(Object.keys(styles));
  if (keys.size === 0 || !root) return false;

  // Every element, in DOCUMENT ORDER — so a section is found and filled no
  // matter how the backend nests it (plain siblings, layout tables, wrappers).
  const all = Array.from(root.querySelectorAll("*"));

  /** The canonical section key this element IS, or null (heading or exact label). */
  const sectionKeyOf = (el: Element): string | null => {
    if (isHeadingElement(el)) {
      const key = sectionKeyForHeading(el.textContent ?? "");
      return KNOWN_SECTION_KEYS.has(key) ? key : null;
    }
    const text = (el.textContent ?? "").trim();
    if (!text || text.length > 40) return null;
    return exactSectionKey(text);
  };

  let changed = false;
  for (let i = 0; i < all.length; i += 1) {
    const start = all[i];
    if (start.hasAttribute("data-hw-section")) continue;
    const key = sectionKeyOf(start);
    // Only mark sections that actually have an override, so a document with none
    // in common is left byte-for-byte untouched.
    if (!key || !keys.has(key)) continue;
    // Mark the section start…
    start.setAttribute("data-hw-section", key);
    changed = true;
    // …then everything that follows in document order, up to the next section
    // START that isn't nested inside this one — so sub-headings and wrapped /
    // table-cell content are all covered.
    for (let j = i + 1; j < all.length; j += 1) {
      const el = all[j];
      if (sectionKeyOf(el) && !start.contains(el)) break;
      if (!el.hasAttribute("data-hw-section")) {
        el.setAttribute("data-hw-section", key);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Tag a rendered document's sections directly from its HTML string (parsed via
 * `DOMParser`). Returns the original string untouched when nothing needed
 * tagging, so callers can pass the result straight to an iframe's `srcDoc`.
 */
function tagSectionsByHeading(
  html: string,
  styles: Record<string, SectionStyle>
): string {
  // Already section-tagged (our markdown / demo renderer) — nothing to do.
  if (/data-hw-section=/i.test(html)) return html;
  if (typeof DOMParser === "undefined") return html;
  if (Object.keys(styles).length === 0) return html;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return html;
  }
  const body = doc.body;
  if (!body) return html;

  const changed = tagSectionsInElement(body, styles);
  if (!changed) return html;
  const doctype = doc.doctype ? "<!doctype html>" : "";
  return doctype + doc.documentElement.outerHTML;
}

/**
 * Inject the section-style overrides into a rendered document's HTML. The
 * document is first section-tagged from its headings (see
 * {@link tagSectionsByHeading}), so the scoped rules land even on the backend's
 * own `preview.html`. A no-op when there is nothing to apply, so callers can
 * pass the result straight to an iframe's `srcDoc`.
 */
export function injectSectionStyles(
  html: string | null | undefined,
  styles: Record<string, SectionStyle>
): string | null | undefined {
  if (!html) return html;
  const css = sectionStyleCss(styles);
  if (!css) return html;
  const tagged = tagSectionsByHeading(html, styles);
  const tag = `<style data-hw-section-styles>${css}</style>`;
  if (/<\/head>/i.test(tagged)) return tagged.replace(/<\/head>/i, `${tag}</head>`);
  return tag + tagged;
}