/**
 * Remembers the Find & Replace tool's state per document — the Match case /
 * First only toggles AND the Find / Replace-with text — so a reopened document
 * reopens the tool exactly the way the user left it (a query routed in from a
 * literal "replace X with Y" survives too). Best-effort and scoped to
 * localStorage: storage failures are swallowed so the tool still works for the
 * current session.
 */

const STORAGE_PREFIX = "hirewave_find_replace_";

export interface FindReplaceSettings {
  /** Case-sensitive matching. */
  matchCase: boolean;
  /** Replace only the first occurrence instead of every one. */
  firstOnly: boolean;
  /** The remembered "Find" query. */
  find: string;
  /** The remembered "Replace with" text. */
  replace: string;
}

const DEFAULT_SETTINGS: FindReplaceSettings = {
  matchCase: false,
  firstOnly: false,
  find: "",
  replace: "",
};

/** Read the remembered tool state for a document (e.g. `resume_42`). */
export function readFindReplaceSettings(key: string): FindReplaceSettings {
  if (!key) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<FindReplaceSettings>;
    return {
      matchCase: Boolean(parsed?.matchCase),
      firstOnly: Boolean(parsed?.firstOnly),
      find: typeof parsed?.find === "string" ? parsed.find : "",
      replace: typeof parsed?.replace === "string" ? parsed.replace : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist the tool state for a document (clears the key when everything is default). */
export function writeFindReplaceSettings(key: string, settings: FindReplaceSettings): void {
  if (!key) return;
  try {
    const isDefault =
      !settings.matchCase &&
      !settings.firstOnly &&
      !settings.find &&
      !settings.replace;
    if (isDefault) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return;
    }
    localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({
        matchCase: settings.matchCase,
        firstOnly: settings.firstOnly,
        find: settings.find,
        replace: settings.replace,
      })
    );
  } catch {
    /* Storage may be unavailable — the tool still works for this session. */
  }
}