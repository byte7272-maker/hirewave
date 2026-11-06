/**
 * Per-version "applied instruction" memory.
 *
 * When a user types an instruction into "Improve with AI" and applies it
 * DIRECTLY (skipping the keep/revert review preview), the resulting version is
 * tagged with the exact wording they typed — so it reads as
 * "Applied: tighten the summary" in the version switcher and stands out next to
 * the previewed, selectively-accepted versions.
 *
 * Stored per document (résumé vs cover letter), best-effort in localStorage;
 * failures are swallowed, mirroring the sibling version memories.
 */

export type VersionAppliedInstructionMap = Record<string, string>;

const PREFIX = "hirewave_version_applied_instruction_";

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

/** Read every version -> applied-instruction entry for a document. */
export function readAppliedInstructionMap(
  kind: string,
  docId: string | number
): VersionAppliedInstructionMap {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: VersionAppliedInstructionMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Tag a version with the instruction that was applied directly to produce it. */
export function saveAppliedInstruction(
  kind: string,
  docId: string | number,
  version: string | number,
  instruction: string
): VersionAppliedInstructionMap {
  const map = readAppliedInstructionMap(kind, docId);
  const text = instruction.trim();
  if (version !== "" && version !== null && version !== undefined && text) {
    map[String(version)] = text;
  }
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/** Look up one version's applied instruction ("" when none is recorded). */
export function getAppliedInstruction(
  kind: string,
  docId: string | number,
  version: string | number | null | undefined
): string {
  if (version === null || version === undefined || version === "") return "";
  return readAppliedInstructionMap(kind, docId)[String(version)] ?? "";
}