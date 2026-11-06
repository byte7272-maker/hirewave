import { useCallback, useEffect, useState } from "react";
import {
  INSTRUCTION_HISTORY_EVENT,
  clearInstructionHistory,
  pushInstructionHistory,
  readInstructionHistory,
  type InstructionHistoryKind,
} from "@/lib/instructionHistory";

export interface RecentInstructionsApi {
  /** The remembered commands, newest first. */
  recent: string[];
  /** Remember a freshly-applied command (moves it to the top). */
  push: (instruction: string) => void;
  /** Forget every remembered command for this document. */
  clear: () => void;
}

/**
 * Read + write the "AI instructions" box's recent-command list for one document,
 * kept in step across every mounted panel (the editor, the quick preview, and the
 * Templates panels all mount an instance for the same document).
 */
export function useRecentInstructions(
  kind: InstructionHistoryKind,
  docId: string | number
): RecentInstructionsApi {
  const [recent, setRecent] = useState<string[]>(() =>
    readInstructionHistory(kind, docId)
  );

  // Re-hydrate whenever the document changes.
  useEffect(() => {
    setRecent(readInstructionHistory(kind, docId));
  }, [kind, docId]);

  // Keep in step with other mounted panels on the same document.
  useEffect(() => {
    function onExternalChange(event: Event) {
      const detail = (event as CustomEvent<{ kind: string; docId: string }>).detail;
      if (!detail || detail.kind !== kind || detail.docId !== String(docId)) return;
      setRecent(readInstructionHistory(kind, docId));
    }
    window.addEventListener(INSTRUCTION_HISTORY_EVENT, onExternalChange);
    return () => window.removeEventListener(INSTRUCTION_HISTORY_EVENT, onExternalChange);
  }, [kind, docId]);

  const push = useCallback(
    (instruction: string) => {
      setRecent(pushInstructionHistory(kind, docId, instruction));
    },
    [kind, docId]
  );

  const clear = useCallback(() => {
    setRecent(clearInstructionHistory(kind, docId));
  }, [kind, docId]);

  return { recent, push, clear };
}