import { useEffect, useState } from "react";
import {
  readDocumentRoleFilter,
  statusQuery,
  writeDocumentRoleFilter,
  type DocStatus,
  type DocStatusQuery,
  type RoleSort,
} from "@/lib/documentListMemory";

export interface DocumentListFilters {
  /** Active / Flagged / Archived — always starts on Active. */
  status: DocStatus;
  setStatus: (status: DocStatus) => void;
  /** Currently-selected role chip, or the "all roles" sentinel. Persisted per list. */
  roleFilter: string;
  setRoleFilter: (role: string) => void;
  /** How the list is ordered (default / by role). */
  sort: RoleSort;
  setSort: (sort: RoleSort) => void;
  /** The query params the active status maps to on the list endpoint. */
  statusParams: DocStatusQuery;
}

/**
 * Shared view state for a document list (résumés / cover letters): the status
 * segmented control, the role-chip filter (persisted per list), and the sort
 * order. The status always starts on Active; the role filter is restored.
 */
export default function useDocumentListFilters(listKey: string): DocumentListFilters {
  const [status, setStatus] = useState<DocStatus>("active");
  const [roleFilter, setRoleFilter] = useState<string>(() =>
    readDocumentRoleFilter(listKey)
  );
  const [sort, setSort] = useState<RoleSort>("default");

  useEffect(() => {
    writeDocumentRoleFilter(listKey, roleFilter);
  }, [listKey, roleFilter]);

  return {
    status,
    setStatus,
    roleFilter,
    setRoleFilter,
    sort,
    setSort,
    statusParams: statusQuery(status),
  };
}