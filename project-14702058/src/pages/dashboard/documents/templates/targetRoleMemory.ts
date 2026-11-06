/**
 * Persisted memory for the Templates view's in-tab "Target role" selection.
 *
 * The picker is seeded from the Document view's tailor selection, but the user
 * can change it right inside the tab. Persisting it per document means that
 * choice survives a reload instead of snapping back to the tailorer's pick.
 */

const PREFIX = "hirewave_templates_target_role_";

/** Read the remembered in-tab improve target for one document ("" = generic). */
export function readTargetRole(docType: string, docId: string | number): string {
  try {
    return localStorage.getItem(`${PREFIX}${docType}_${docId}`) ?? "";
  } catch {
    return "";
  }
}

/** Persist (or clear, for "") the in-tab improve target for one document. */
export function writeTargetRole(
  docType: string,
  docId: string | number,
  value: string
): void {
  try {
    const key = `${PREFIX}${docType}_${docId}`;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable — the selection still works for this session */
  }
}