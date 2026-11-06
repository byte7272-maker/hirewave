/**
 * Saved-style library: a small, user-managed collection of named looks
 * (a template + accent pair) that survive beyond the one document they were
 * built on. A style saved from a résumé can be re-applied to any other résumé,
 * and likewise for cover letters.
 *
 * A "quality gate" runs before anything is saved: a style needs a real name, a
 * name that isn't already taken, and at least one deliberate deviation from the
 * built-in default — so the library fills with intentional looks, not
 * duplicates of the stock layout.
 *
 * Storage: one JSON array in localStorage. Never throws.
 */

export type LibraryStyleKind = "resume" | "cover-letter";

/**
 * Where a saved look branched from — the accent/font it started as before it
 * was edited or duplicated. Powers the "Modified from Modern · Teal" lineage
 * note, so two near-identical variations can be told apart at a glance.
 */
export interface StyleOrigin {
  themeId: string;
  accentId: string;
  fontId?: string;
  /** The name of the style this was branched from, when there was one. */
  name?: string;
}

export interface LibraryStyle {
  id: string;
  name: string;
  kind: LibraryStyleKind;
  themeId: string;
  accentId: string;
  /**
   * The typeface pairing applied with this look. Optional for styles saved
   * before font variations existed — callers fall back to a default font id.
   */
  fontId?: string;
  /** Optional role tag — the target role this look was saved against. */
  roleId?: string;
  roleLabel?: string;
  /** Optional one-line note describing the look. */
  note?: string;
  /**
   * The look this one branched from, captured when an existing variation is
   * edited (or duplicated). Absent for styles saved from scratch.
   */
  origin?: StyleOrigin;
  createdAt: number;
}

const STORAGE_KEY = "hirewave_style_library";

function isKind(value: unknown): value is LibraryStyleKind {
  return value === "resume" || value === "cover-letter";
}

function isOrigin(value: unknown): value is StyleOrigin {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.themeId === "string" &&
    typeof v.accentId === "string" &&
    (v.fontId === undefined || typeof v.fontId === "string") &&
    (v.name === undefined || typeof v.name === "string")
  );
}

function isStyle(value: unknown): value is LibraryStyle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    isKind(v.kind) &&
    typeof v.themeId === "string" &&
    typeof v.accentId === "string" &&
    (v.fontId === undefined || typeof v.fontId === "string") &&
    (v.roleId === undefined || typeof v.roleId === "string") &&
    (v.roleLabel === undefined || typeof v.roleLabel === "string") &&
    (v.origin === undefined || isOrigin(v.origin))
  );
}

function readAll(): LibraryStyle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStyle);
  } catch {
    return [];
  }
}

function writeAll(list: LibraryStyle[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — the library simply won't persist this session */
  }
}

/** All saved styles, newest first. Optionally narrowed to one document kind. */
export function listLibraryStyles(kind?: LibraryStyleKind): LibraryStyle[] {
  const all = readAll().sort((a, b) => b.createdAt - a.createdAt);
  return kind ? all.filter((s) => s.kind === kind) : all;
}

function newId(): string {
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Add a style to the library. Caller is expected to have passed the quality gate. */
export function addLibraryStyle(input: {
  name: string;
  kind: LibraryStyleKind;
  themeId: string;
  accentId: string;
  fontId?: string;
  roleId?: string;
  roleLabel?: string;
  note?: string;
  origin?: StyleOrigin;
}): LibraryStyle {
  const entry: LibraryStyle = {
    id: newId(),
    name: input.name.trim(),
    kind: input.kind,
    themeId: input.themeId,
    accentId: input.accentId,
    fontId: input.fontId || undefined,
    roleId: input.roleId || undefined,
    roleLabel: input.roleLabel?.trim() || undefined,
    note: input.note?.trim() || undefined,
    origin: input.origin,
    createdAt: Date.now(),
  };
  writeAll([entry, ...readAll()]);
  return entry;
}

/** Update a saved style in place (e.g. re-save a tweaked look under the same id). */
export function updateLibraryStyle(
  id: string,
  patch: Partial<Omit<LibraryStyle, "id" | "createdAt">>
): LibraryStyle | null {
  const all = readAll();
  const index = all.findIndex((s) => s.id === id);
  if (index < 0) return null;
  all[index] = { ...all[index], ...patch, name: (patch.name ?? all[index].name).trim() };
  writeAll(all);
  return all[index];
}

/** Remove a saved style. */
export function deleteLibraryStyle(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** True when a style of this kind already uses the name (case-insensitive). */
export function isLibraryNameTaken(
  kind: LibraryStyleKind,
  name: string,
  ignoreId?: string
): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  return readAll().some(
    (s) => s.kind === kind && s.id !== ignoreId && s.name.toLowerCase() === needle
  );
}

export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Short hint shown while the check is failing. */
  hint: string;
}

export interface QualityResult {
  /** True only when every check passes. */
  passed: boolean;
  checks: QualityCheck[];
  /** How many checks passed, for a "2 of 3" style readout. */
  passedCount: number;
}

/**
 * The save-quality gate. Evaluated live as the user types a name, so the dialog
 * can show exactly what still needs to change before the style can be saved.
 */
export function evaluateStyleQuality(input: {
  name: string;
  kind: LibraryStyleKind;
  themeId: string;
  accentId: string;
  /** The typeface being composed (defaults to the stock font when omitted). */
  fontId?: string;
  defaultThemeId: string;
  defaultAccentId: string;
  /** The stock font id — deviating from it also counts as customized. */
  defaultFontId?: string;
  /** Pass when editing an existing saved style, so its own name isn't "taken". */
  editingId?: string;
}): QualityResult {
  const name = input.name.trim();
  const checks: QualityCheck[] = [
    {
      id: "name",
      label: "Named (at least 3 characters)",
      passed: name.length >= 3,
      hint: "Give this look a clear name so you can find it again.",
    },
    {
      id: "unique",
      label: "Name not already in your library",
      passed: !isLibraryNameTaken(input.kind, name, input.editingId),
      hint: "You already saved a style with this name.",
    },
    {
      id: "distinct",
      label: "Customized from the default look",
      passed:
        input.themeId !== input.defaultThemeId ||
        input.accentId !== input.defaultAccentId ||
        (input.fontId ?? input.defaultFontId) !== input.defaultFontId,
      hint: "Pick a different layout, accent, or font so this is worth saving.",
    },
  ];
  const passedCount = checks.filter((c) => c.passed).length;
  return { passed: passedCount === checks.length, checks, passedCount };
}

/** The portable envelope written by the export action. */
export interface LibraryExport {
  app: "hirewave-style-library";
  version: 1;
  exportedAt: number;
  styles: LibraryStyle[];
}

/**
 * Serialize the library to a portable JSON string (pretty-printed so it's a
 * readable, diffable file). Pass a kind to export only that document type.
 */
export function serializeLibrary(kind?: LibraryStyleKind): string {
  const payload: LibraryExport = {
    app: "hirewave-style-library",
    version: 1,
    exportedAt: Date.now(),
    styles: listLibraryStyles(kind),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  /** How many styles were merged in. */
  added: number;
  /** How many entries were skipped (corrupt, or already present by id). */
  skipped: number;
}

/**
 * Merge a previously-exported library file into this browser's library. Corrupt
 * entries and styles already present (same id) are skipped, and any name that
 * collides with an existing look is suffixed — so importing never overwrites or
 * duplicates what's already saved. Never throws.
 */
export function importLibrary(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { added: 0, skipped: 0 };
  }

  // Accept either the export envelope or a bare array of styles.
  let candidates: unknown[] = [];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === "object") {
    const styles = (parsed as Record<string, unknown>).styles;
    if (Array.isArray(styles)) candidates = styles;
  }

  const existing = readAll();
  const byId = new Set(existing.map((s) => s.id));
  const namesByKind: Record<LibraryStyleKind, Set<string>> = {
    resume: new Set(
      existing.filter((s) => s.kind === "resume").map((s) => s.name.toLowerCase())
    ),
    "cover-letter": new Set(
      existing.filter((s) => s.kind === "cover-letter").map((s) => s.name.toLowerCase())
    ),
  };

  const added: LibraryStyle[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    if (!isStyle(candidate)) {
      skipped += 1;
      continue;
    }
    if (byId.has(candidate.id)) {
      skipped += 1;
      continue;
    }
    // Resolve name collisions with a numeric suffix so nothing is confusing.
    let name = candidate.name.trim();
    let n = 2;
    while (namesByKind[candidate.kind].has(name.toLowerCase())) {
      name = `${candidate.name.trim()} (${n})`;
      n += 1;
    }
    namesByKind[candidate.kind].add(name.toLowerCase());
    byId.add(candidate.id);
    added.push({ ...candidate, name, createdAt: candidate.createdAt || Date.now() });
  }

  if (added.length) writeAll([...added, ...existing]);
  return { added: added.length, skipped };
}