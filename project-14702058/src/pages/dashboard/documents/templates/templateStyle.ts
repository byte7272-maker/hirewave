/**
 * Presentation-style memory shared by the résumé and cover-letter template
 * galleries.
 *
 * Each document remembers the template + accent it was last styled with, and —
 * importantly — a separate choice per saved version, so switching back to a
 * version restores exactly how it looked. A cover letter with no style of its
 * own can borrow its linked résumé's choice, keeping the pair consistent.
 *
 * Storage is a single JSON blob per document, so the two fields never drift:
 *   { current: { themeId, accentId }, versions: { "<v>": { themeId, accentId } } }
 *
 * The legacy flat keys (one theme key + one accent key per document) are still
 * read as a fallback so existing picks survive the upgrade.
 */

export type DocKind = "resume" | "cover-letter";

export interface StyleChoice {
  themeId: string;
  accentId: string;
  /** Chosen typeface (the font dimension of a saved-style variation). */
  fontId?: string;
}

/** A partially-known choice — either field may be missing (e.g. legacy data). */
export type PartialStyleChoice = Partial<StyleChoice>;

interface StyleMemory {
  current?: StyleChoice;
  versions?: Record<string, StyleChoice>;
  /**
   * The last template the user previewed (selected to look at) without applying.
   * Distinct from `current`: it lets a document reopen exactly where the user
   * left off browsing, even when the previewed layout was never applied.
   */
  preview?: StyleChoice;
}

const PREFIX = "hirewave_template_style_";

const LEGACY_KEYS: Record<DocKind, { theme: string; accent: string }> = {
  resume: { theme: "hirewave_resume_template_", accent: "hirewave_resume_accent_" },
  "cover-letter": {
    theme: "hirewave_cover_letter_template_",
    accent: "hirewave_cover_letter_accent_",
  },
};

function storageKey(kind: DocKind, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

function isChoice(value: unknown): value is StyleChoice {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.themeId === "string" &&
    typeof v.accentId === "string" &&
    (v.fontId === undefined || typeof v.fontId === "string")
  );
}

function readMemory(kind: DocKind, docId: string | number): StyleMemory {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const mem: StyleMemory = {};
    if (isChoice(parsed.current)) mem.current = parsed.current;
    if (parsed.versions && typeof parsed.versions === "object") {
      const versions: Record<string, StyleChoice> = {};
      for (const [key, value] of Object.entries(
        parsed.versions as Record<string, unknown>
      )) {
        if (isChoice(value)) versions[key] = value;
      }
      if (Object.keys(versions).length) mem.versions = versions;
    }
    if (isChoice(parsed.preview)) mem.preview = parsed.preview;
    return mem;
  } catch {
    return {};
  }
}

function writeMemory(
  kind: DocKind,
  docId: string | number,
  mem: StyleMemory
): void {
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(mem));
  } catch {
    /* storage unavailable — the choice still applies for this session */
  }
}

/** Read the legacy flat theme/accent keys, when present. */
function readLegacy(kind: DocKind, docId: string | number): PartialStyleChoice | null {
  try {
    const keys = LEGACY_KEYS[kind];
    const themeId = localStorage.getItem(keys.theme + docId) ?? undefined;
    const accentId = localStorage.getItem(keys.accent + docId) ?? undefined;
    if (!themeId && !accentId) return null;
    return { themeId, accentId };
  } catch {
    return null;
  }
}

function isVersioned(version: string | number | null | undefined): boolean {
  return version !== null && version !== undefined && String(version) !== "";
}

/**
 * Resolve the remembered style for a document. When a version is given and it
 * has its own entry, that wins; otherwise the document's current choice is used,
 * then any legacy keys. Returns null when nothing is remembered.
 */
export function readStyle(
  kind: DocKind,
  docId: string | number,
  version?: string | number | null
): PartialStyleChoice | null {
  const mem = readMemory(kind, docId);
  if (isVersioned(version)) {
    const v = mem.versions?.[String(version)];
    if (v) return v;
  }
  if (mem.current) return mem.current;
  return readLegacy(kind, docId);
}

/** True when this document has an explicit current style of its own (no inheritance). */
export function hasOwnStyle(kind: DocKind, docId: string | number): boolean {
  const mem = readMemory(kind, docId);
  return Boolean(mem.current) || Boolean(readLegacy(kind, docId));
}

/**
 * Persist a style pick. Always updates the document's current choice, and — when
 * a version is supplied — records it against that version too, so revisiting the
 * version restores the exact look.
 */
export function saveStyle(
  kind: DocKind,
  docId: string | number,
  version: string | number | null | undefined,
  choice: StyleChoice
): void {
  const mem = readMemory(kind, docId);
  mem.current = choice;
  if (isVersioned(version)) {
    mem.versions = { ...(mem.versions ?? {}), [String(version)]: choice };
  }
  writeMemory(kind, docId, mem);
}

/**
 * Forget a document's own style, falling it back to an inherited one (used by a
 * cover letter to re-adopt its linked résumé's look). When a version is given,
 * only that version's own entry is dropped; the current default is cleared too.
 */
export function clearStyle(
  kind: DocKind,
  docId: string | number,
  version?: string | number | null
): void {
  const mem = readMemory(kind, docId);
  if (isVersioned(version) && mem.versions) {
    delete mem.versions[String(version)];
    if (!Object.keys(mem.versions).length) delete mem.versions;
  }
  delete mem.current;
  writeMemory(kind, docId, mem);
}

/**
 * Read the last template the user *previewed* (but may not have applied) for a
 * document. Returns null when nothing has been previewed. Unlike `readStyle`,
 * this is document-scoped, not version-scoped — "where I was browsing" is a
 * property of the document, not one saved version.
 */
export function readPreview(
  kind: DocKind,
  docId: string | number
): StyleChoice | null {
  return readMemory(kind, docId).preview ?? null;
}

/** Remember the last previewed (not necessarily applied) template for a document. */
export function savePreview(
  kind: DocKind,
  docId: string | number,
  choice: StyleChoice
): void {
  const mem = readMemory(kind, docId);
  mem.preview = choice;
  writeMemory(kind, docId, mem);
}

/** Forget a document's last-previewed template (e.g. once it has been applied). */
export function clearPreview(kind: DocKind, docId: string | number): void {
  const mem = readMemory(kind, docId);
  delete mem.preview;
  writeMemory(kind, docId, mem);
}