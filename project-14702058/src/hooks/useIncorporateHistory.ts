import { useCallback, useEffect, useRef, useState } from "react";
import {
  INCORPORATE_HISTORY_EVENT,
  makeIncorporateEntryId,
  notifyIncorporateHistoryChange,
  readIncorporateHistory,
  writeIncorporateHistory,
  type IncorporateEntry,
  type IncorporateKind,
  type IncorporateStatus,
} from "@/lib/incorporateHistory";

export interface IncorporateHistoryApi {
  /** The submissions, oldest first. */
  entries: IncorporateEntry[];
  /** How many past submissions never landed (the re-run candidates). */
  notImplemented: IncorporateEntry[];
  /**
   * Record a fresh submission. Any still-open prior submission is closed as
   * "not-implemented" (a newer submission supersedes it). Returns the new id.
   */
  record: (text: string, ideas: string[]) => string;
  /** Re-arm past submissions so a re-run can settle them again. */
  rearm: (ids: string[]) => void;
  /** Close every open submission: implemented (with its sections) or not. */
  settle: (
    status: Exclude<IncorporateStatus, "pending">,
    impacted: string[],
    passages?: string[]
  ) => void;
  /** Drop one entry from the history. */
  remove: (id: string) => void;
  /** Forget the whole history for this document. */
  clearAll: () => void;
}

/**
 * Read + write the "Add your own points" submission history for one document,
 * kept in step across every mounted panel (the editor and the quick preview both
 * mount an instance for the same document).
 */
export function useIncorporateHistory(
  kind: IncorporateKind,
  docId: string | number
): IncorporateHistoryApi {
  const [entries, setEntries] = useState<IncorporateEntry[]>(() =>
    readIncorporateHistory(kind, docId)
  );
  // Ids of submissions still awaiting an accept/reject decision.
  const openRef = useRef<Set<string>>(new Set());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const apply = useCallback(
    (next: IncorporateEntry[]) => {
      entriesRef.current = next;
      setEntries(next);
      writeIncorporateHistory(kind, docId, next);
      notifyIncorporateHistoryChange(kind, docId);
    },
    [kind, docId]
  );

  // Re-hydrate whenever the document changes.
  useEffect(() => {
    openRef.current = new Set();
    const next = readIncorporateHistory(kind, docId);
    entriesRef.current = next;
    setEntries(next);
  }, [kind, docId]);

  // Keep in step with other mounted panels on the same document.
  useEffect(() => {
    function onExternalChange(event: Event) {
      const detail = (event as CustomEvent<{ kind: string; docId: string }>).detail;
      if (!detail || detail.kind !== kind || detail.docId !== String(docId)) return;
      const next = readIncorporateHistory(kind, docId);
      entriesRef.current = next;
      setEntries(next);
    }
    window.addEventListener(INCORPORATE_HISTORY_EVENT, onExternalChange);
    return () => window.removeEventListener(INCORPORATE_HISTORY_EVENT, onExternalChange);
  }, [kind, docId]);

  const record = useCallback(
    (text: string, ideas: string[]) => {
      const id = makeIncorporateEntryId();
      const open = openRef.current;
      const closed = entriesRef.current.map((e) =>
        open.has(e.id) && e.status === "pending"
          ? { ...e, status: "not-implemented" as const, impacted: [] }
          : e
      );
      openRef.current = new Set([id]);
      const entry: IncorporateEntry = {
        id,
        text,
        ideas,
        submittedAt: new Date().toISOString(),
        status: "pending",
        impacted: [],
      };
      apply([...closed, entry]);
      return id;
    },
    [apply]
  );

  const rearm = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const set = new Set(ids);
      ids.forEach((id) => openRef.current.add(id));
      apply(
        entriesRef.current.map((e) =>
          set.has(e.id) ? { ...e, status: "pending" as const, impacted: [] } : e
        )
      );
    },
    [apply]
  );

  const settle = useCallback(
    (status: Exclude<IncorporateStatus, "pending">, impacted: string[], passages?: string[]) => {
      if (openRef.current.size === 0) return;
      const open = new Set(openRef.current);
      openRef.current = new Set();
      apply(
        entriesRef.current.map((e) =>
          open.has(e.id)
            ? {
                ...e,
                status,
                impacted: status === "implemented" ? impacted : [],
                passages: status === "implemented" ? passages ?? [] : [],
              }
            : e
        )
      );
    },
    [apply]
  );

  const remove = useCallback(
    (id: string) => {
      openRef.current.delete(id);
      apply(entriesRef.current.filter((e) => e.id !== id));
    },
    [apply]
  );

  const clearAll = useCallback(() => {
    openRef.current = new Set();
    apply([]);
  }, [apply]);

  const notImplemented = entries.filter((e) => e.status !== "implemented");

  return { entries, notImplemented, record, rearm, settle, remove, clearAll };
}