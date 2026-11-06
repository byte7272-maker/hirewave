import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearImprovePicks,
  fetchImprovePicks,
  saveImprovePicks,
  type ImproveLastRun,
  type ImprovePicks,
} from "@/lib/improvePicksApi";

/**
 * Remembered "Improve with AI" picks for one document, shared by the Document
 * view and the Templates view (same keys, so choosing chips in one place is
 * reflected in the other). Stores the selected prompt chips, the optional custom
 * instruction, the ticked review findings, and the last improve run.
 *
 * The picks follow the user's account across devices: they are loaded from and
 * saved to the signed-in account (see `improvePicksApi`), with localStorage as
 * the instant cache and the offline fallback.
 *
 * `prefix` namespaces the keys per document type. Résumés use the default
 * (matching the résumé Document view); cover letters pass
 * "hirewave_cover_letter_improve" (matching the cover-letter Document view).
 */

const DEFAULT_PREFIX = "hirewave_improve";
/** Debounce before syncing to the account, so typing an instruction doesn't spam the API. */
const ACCOUNT_SYNC_DELAY = 800;
/**
 * Window event fired whenever remembered picks change (e.g. chips consumed after
 * an improvement is applied). The Document and Templates views each mount their
 * own memory instance on the same document, so this keeps them in agreement.
 */
const MEMORY_EVENT = "hirewave:improve-memory-change";

/** Tell every other mounted instance for the same document to re-read storage. */
function notifyMemoryChange(prefix: string, docId: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent(MEMORY_EVENT, { detail: { prefix, docId } })
    );
  } catch {
    /* no window (SSR) — nothing to sync */
  }
}

const instructionKey = (prefix: string, docId: string) => `${prefix}_instruction_${docId}`;
const promptsKey = (prefix: string, docId: string) => `${prefix}_prompts_${docId}`;
const findingsKey = (prefix: string, docId: string) => `${prefix}_findings_${docId}`;
const lastKey = (prefix: string, docId: string) => `${prefix}_last_${docId}`;
/** Stable account-side key for one document (kind + id), so it follows the user. */
const accountKey = (prefix: string, docId: string) => `${prefix}:${docId}`;

/** Read a persisted string, or "" when unset. */
function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Read a persisted string array, dropping anything not in `allowed` when given. */
function readStringArray(key: string, allowed?: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string =>
        typeof v === "string" && v.trim().length > 0 && (!allowed || allowed.includes(v))
    );
  } catch {
    return [];
  }
}

/** Read the remembered last improve run, or null when unset/empty. */
function readLast(key: string): ImproveLastRun | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    const run: ImproveLastRun = {
      prompts: Array.isArray(rec.prompts)
        ? rec.prompts.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        : [],
      instruction: typeof rec.instruction === "string" ? rec.instruction : "",
      findings: Array.isArray(rec.findings)
        ? rec.findings.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        : [],
    };
    if (!run.prompts.length && !run.findings.length && !run.instruction.trim()) return null;
    return run;
  } catch {
    return null;
  }
}

/** Best-effort localStorage write (null removes the key). */
function writeKey(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable — the value still applies for this session */
  }
}

export interface ImproveMemoryApi {
  instruction: string;
  updateInstruction: (value: string) => void;
  selectedPrompts: string[];
  updateSelectedPrompts: (prompts: string[]) => void;
  /** Ticked AI Review findings, remembered per document so they survive a reopen. */
  selectedFindings: string[];
  updateSelectedFindings: (findings: string[]) => void;
  /** The exact combo (chips + instruction + findings) of the last improve run. */
  lastImprove: ImproveLastRun | null;
  /** Remember a launched improve so it can be re-run in one click. */
  recordLastImprove: (prompts: string[], instruction: string, findings: string[]) => void;
  /**
   * Remove ONLY the selected improvement chips (keeps the ticked findings, the
   * custom instruction, and the last-run history). Called once an improvement is
   * accepted, so it isn't offered as pre-selected again.
   */
  clearPrompts: () => void;
  /** Forget the document's chips + custom instruction (the last run is kept). */
  clearRemembered: () => void;
}

export function useImproveMemory(
  docId: string,
  presets: string[],
  prefix: string = DEFAULT_PREFIX
): ImproveMemoryApi {
  const keys = useMemo(
    () => ({
      instr: instructionKey(prefix, docId),
      prompts: promptsKey(prefix, docId),
      findings: findingsKey(prefix, docId),
      last: lastKey(prefix, docId),
      account: accountKey(prefix, docId),
    }),
    [prefix, docId]
  );

  // Latest preset catalog, readable from inside effects without re-running them.
  const presetsRef = useRef(presets);
  presetsRef.current = presets;

  const [instruction, setInstruction] = useState<string>(() => readString(keys.instr));
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>(() =>
    readStringArray(keys.prompts, presets)
  );
  const [selectedFindings, setSelectedFindings] = useState<string[]>(() =>
    readStringArray(keys.findings)
  );
  const [lastImprove, setLastImprove] = useState<ImproveLastRun | null>(() =>
    readLast(keys.last)
  );

  // Re-hydrate from the local cache whenever the document (or prefix) changes.
  useEffect(() => {
    setInstruction(readString(keys.instr));
    setSelectedPrompts(readStringArray(keys.prompts, presetsRef.current));
    setSelectedFindings(readStringArray(keys.findings));
    setLastImprove(readLast(keys.last));
  }, [keys]);

  // Keep every mounted instance for this document in step — the Document and
  // Templates views each hold their own memory, so a clear in one (e.g. chips
  // consumed after an improvement is applied) is reflected in the other.
  useEffect(() => {
    function onExternalChange(event: Event) {
      const detail = (event as CustomEvent<{ prefix: string; docId: string }>).detail;
      if (!detail || detail.prefix !== prefix || String(detail.docId) !== String(docId)) return;
      setInstruction(readString(keys.instr));
      setSelectedPrompts(readStringArray(keys.prompts, presetsRef.current));
      setSelectedFindings(readStringArray(keys.findings));
      setLastImprove(readLast(keys.last));
    }
    window.addEventListener(MEMORY_EVENT, onExternalChange);
    return () => window.removeEventListener(MEMORY_EVENT, onExternalChange);
  }, [keys, prefix, docId]);

  // The full record, so an update can sync the whole document state to the account.
  const record = useMemo<ImprovePicks>(
    () => ({
      prompts: selectedPrompts,
      instruction,
      findings: selectedFindings,
      last: lastImprove,
    }),
    [selectedPrompts, instruction, selectedFindings, lastImprove]
  );
  const recordRef = useRef(record);
  recordRef.current = record;

  // ---- Account sync (debounced, best-effort) ----
  const syncTimer = useRef<number | null>(null);
  const pendingRef = useRef<ImprovePicks | null>(null);

  const flushAccountSync = useCallback(() => {
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    const payload = pendingRef.current;
    pendingRef.current = null;
    // Never push a fully-empty record — there's nothing worth remembering.
    if (
      !payload ||
      (!payload.prompts.length &&
        !payload.findings.length &&
        !payload.instruction.trim() &&
        !payload.last)
    ) {
      return;
    }
    saveImprovePicks(keys.account, payload).catch(() => {
      /* offline or endpoint unavailable — localStorage still holds the picks */
    });
  }, [keys.account]);

  const scheduleAccountSync = useCallback(
    (payload: ImprovePicks) => {
      pendingRef.current = payload;
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        syncTimer.current = null;
        flushAccountSync();
      }, ACCOUNT_SYNC_DELAY);
    },
    [flushAccountSync]
  );

  // Flush any pending sync when the document changes or the hook unmounts.
  useEffect(() => () => flushAccountSync(), [flushAccountSync]);

  // On mount, pull the account copy. The account always wins; when it has nothing
  // for this document but this device does, lift the local picks up so they follow.
  useEffect(() => {
    let alive = true;
    fetchImprovePicks()
      .then((map) => {
        if (!alive) return;
        const remote = map[keys.account];
        if (remote) {
          setInstruction(remote.instruction);
          setSelectedPrompts(
            remote.prompts.filter((p) => presetsRef.current.includes(p))
          );
          setSelectedFindings(remote.findings);
          setLastImprove(remote.last ?? null);
          writeKey(keys.instr, remote.instruction || null);
          writeKey(keys.prompts, remote.prompts.length ? JSON.stringify(remote.prompts) : null);
          writeKey(
            keys.findings,
            remote.findings.length ? JSON.stringify(remote.findings) : null
          );
          writeKey(keys.last, remote.last ? JSON.stringify(remote.last) : null);
          return;
        }
        const localRecord: ImprovePicks = {
          prompts: readStringArray(keys.prompts, presetsRef.current),
          instruction: readString(keys.instr),
          findings: readStringArray(keys.findings),
          last: readLast(keys.last),
        };
        if (
          localRecord.prompts.length ||
          localRecord.findings.length ||
          localRecord.instruction.trim() ||
          localRecord.last
        ) {
          saveImprovePicks(keys.account, localRecord).catch(() => {
            /* best-effort lift */
          });
        }
      })
      .catch(() => {
        /* endpoint unavailable — the local cache keeps the picks working */
      });
    return () => {
      alive = false;
    };
  }, [keys]);

  const updateInstruction = useCallback(
    (value: string) => {
      setInstruction(value);
      writeKey(keys.instr, value || null);
      scheduleAccountSync({ ...recordRef.current, instruction: value });
    },
    [keys.instr, scheduleAccountSync]
  );

  const updateSelectedPrompts = useCallback(
    (prompts: string[]) => {
      setSelectedPrompts(prompts);
      writeKey(keys.prompts, prompts.length ? JSON.stringify(prompts) : null);
      scheduleAccountSync({ ...recordRef.current, prompts });
    },
    [keys.prompts, scheduleAccountSync]
  );

  const updateSelectedFindings = useCallback(
    (findings: string[]) => {
      setSelectedFindings(findings);
      writeKey(keys.findings, findings.length ? JSON.stringify(findings) : null);
      scheduleAccountSync({ ...recordRef.current, findings });
    },
    [keys.findings, scheduleAccountSync]
  );

  const recordLastImprove = useCallback(
    (prompts: string[], instructionText: string, findings: string[]) => {
      if (!prompts.length && !findings.length && !instructionText.trim()) return;
      const last: ImproveLastRun = { prompts, instruction: instructionText, findings };
      setLastImprove(last);
      writeKey(keys.last, JSON.stringify(last));
      scheduleAccountSync({ ...recordRef.current, last });
    },
    [keys.last, scheduleAccountSync]
  );

  const clearPrompts = useCallback(() => {
    setSelectedPrompts([]);
    writeKey(keys.prompts, null);
    // Drop any debounced write still holding the old chips, then persist the
    // chips-cleared record straight away so the account matches this device too.
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    pendingRef.current = null;
    const next: ImprovePicks = { ...recordRef.current, prompts: [] };
    if (!next.findings.length && !next.instruction.trim() && !next.last) {
      clearImprovePicks(keys.account).catch(() => {
        /* best-effort */
      });
    } else {
      saveImprovePicks(keys.account, next).catch(() => {
        /* best-effort */
      });
    }
    notifyMemoryChange(prefix, docId);
  }, [keys.prompts, keys.account, prefix, docId]);

  const clearRemembered = useCallback(() => {
    setSelectedPrompts([]);
    setSelectedFindings([]);
    setInstruction("");
    writeKey(keys.prompts, null);
    writeKey(keys.findings, null);
    writeKey(keys.instr, null);
    if (syncTimer.current) {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    pendingRef.current = null;
    // Keep the last run available, but drop everything else from the account.
    const last = recordRef.current.last ?? null;
    if (last) {
      saveImprovePicks(keys.account, {
        prompts: [],
        instruction: "",
        findings: [],
        last,
      }).catch(() => {
        /* best-effort */
      });
    } else {
      clearImprovePicks(keys.account).catch(() => {
        /* best-effort */
      });
    }
    notifyMemoryChange(prefix, docId);
  }, [keys, prefix, docId]);

  return {
    instruction,
    updateInstruction,
    selectedPrompts,
    updateSelectedPrompts,
    selectedFindings,
    updateSelectedFindings,
    lastImprove,
    recordLastImprove,
    clearPrompts,
    clearRemembered,
  };
}