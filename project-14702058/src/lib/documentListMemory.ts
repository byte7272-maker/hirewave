/**
 * Document-list view memory + helpers.
 *
 * The Documents page has two lists (résumés / cover letters). Each list has a
 * status segmented control (Active / Flagged / Archived) plus a "filter by role"
 * chip row. The status always resets to Active on load, while the role pick is
 * remembered per list so a narrowed view survives a reload.
 */

/** Sentinel meaning "show every role". */
export const ALL_ROLES = "__all__";

/** The three list states, mapped to list-endpoint query params. */
export type DocStatus = "active" | "flagged" | "archived";

/** How the list is ordered. "default" keeps the server order. */
export type RoleSort = "default" | "role_asc" | "role_desc";

/** Query params a status maps to on the list endpoints. */
export interface DocStatusQuery {
  archived?: boolean;
  flagged?: boolean;
}

/** Map a status to its list-endpoint query params. */
export function statusQuery(status: DocStatus): DocStatusQuery {
  if (status === "flagged") return { flagged: true };
  if (status === "archived") return { archived: true };
  return { archived: false };
}

const ROLE_PREFIX = "hirewave_documents_role_filter_";

/** Read the remembered role filter for one list (ALL_ROLES when unset). */
export function readDocumentRoleFilter(listKey: string): string {
  try {
    return localStorage.getItem(`${ROLE_PREFIX}${listKey}`) ?? ALL_ROLES;
  } catch {
    return ALL_ROLES;
  }
}

/** Persist (or clear, for the all-roles sentinel) the role filter for one list. */
export function writeDocumentRoleFilter(listKey: string, value: string): void {
  try {
    const key = `${ROLE_PREFIX}${listKey}`;
    if (value && value !== ALL_ROLES) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable — the filter still works for this session */
  }
}

/**
 * Order items so same-role documents group together. Unlabeled items (no
 * last-aimed-at role) always sort last, regardless of direction.
 */
export function sortByRole<T>(
  items: T[],
  getLabel: (item: T) => string,
  sort: RoleSort
): T[] {
  if (sort === "default") return items;
  const dir = sort === "role_asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const la = getLabel(a).trim().toLowerCase();
    const lb = getLabel(b).trim().toLowerCase();
    if (!la && !lb) return 0;
    if (!la) return 1;
    if (!lb) return -1;
    return la.localeCompare(lb) * dir;
  });
}