import type { EvidencePromptsResult } from "./documents";

/**
 * Persistent, per-device store for the "My Work Highlights" prompt set.
 *
 * Generating the prompts is an explicit user action, and the generated set is
 * held until the user asks to generate again — so it is kept here, keyed by
 * résumé + target role, instead of being re-fetched on every mount. This is
 * structured data meant to survive reloads, so it lives in IndexedDB rather
 * than localStorage.
 *
 * Local-only scratch; never synced.
 */

const DB_NAME = "hirewave-work-highlights";
const DB_VERSION = 1;
const STORE = "generated_prompts";

interface StoredPrompts {
  key: string;
  result: EvidencePromptsResult;
  savedAt: number;
}

/** Stable storage key for a résumé + (optional) target-role combination. */
export function generatedPromptsKey(
  resumeId: string | number,
  jobPostingId?: string | number
): string {
  return `${resumeId}::${jobPostingId ?? ""}`;
}

/** Open (and lazily create) the store's database. Resolves null when unavailable. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** A stored value is only trusted when it carries the expected shape. */
function isPromptsResult(value: unknown): value is EvidencePromptsResult {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return Array.isArray(rec.prompts) && typeof rec.guidance === "string";
}

/**
 * Read the held prompt set for a key, or null when the user hasn't generated one
 * yet (so the panel can ask them to). Never throws — a failure reads as "none".
 */
export async function readGeneratedPrompts(
  key: string
): Promise<EvidencePromptsResult | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result as StoredPrompts | undefined;
        resolve(rec && isPromptsResult(rec.result) ? rec.result : null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

/** Persist the generated prompt set for a key. Best-effort — never throws. */
export async function writeGeneratedPrompts(
  key: string,
  result: EvidencePromptsResult
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, result, savedAt: Date.now() } as StoredPrompts);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Forget a held prompt set for a key. Best-effort — never throws. */
export async function clearGeneratedPrompts(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}