/**
 * Per-document memory for the version switcher's "filter by role" selection.
 *
 * The version switcher narrows a long history to one tailored role. Persisting
 * that pick per document means the narrowed view survives a reload instead of
 * snapping back to "All roles".
 */

const PREFIX = "hirewave_version_role_filter_";

/** The sentinel value meaning "show every version" (no role narrowing). */
export const ALL_ROLES = "__all__";

/** Read the remembered role filter for one document (ALL_ROLES when unset). */
export function readVersionRoleFilter(key: string): string {
  try {
    return localStorage.getItem(`${PREFIX}${key}`) ?? ALL_ROLES;
  } catch {
    return ALL_ROLES;
  }
}

/** Persist (or clear, for the all-roles sentinel) the role filter for one document. */
export function writeVersionRoleFilter(key: string, value: string): void {
  try {
    const storageKey = `${PREFIX}${key}`;
    if (value && value !== ALL_ROLES) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
  } catch {
    /* storage may be unavailable — the filter still works for this session */
  }
}