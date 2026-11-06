/**
 * Local memory for the "past inputs" log's view state.
 *
 * The log tucks its Implemented entries into one collapsible group. Whether that
 * group is left open is remembered per document, so power users who like to keep
 * it expanded don't have to re-open it on every visit — while everyone else still
 * gets the focused, closed-by-default view.
 *
 * Local-only, like the draft and history it accompanies, because it is working
 * scratch material tied to this device.
 */

const PREFIX = "hirewave_past_inputs_open";

function storageKey(memoryKey: string): string {
  return `${PREFIX}_${memoryKey}`;
}

/** Whether the "Implemented" group was last left open for this document. */
export function readImplementedOpen(memoryKey: string | undefined): boolean {
  if (!memoryKey) return false;
  try {
    return localStorage.getItem(storageKey(memoryKey)) === "open";
  } catch {
    return false;
  }
}

/** Remember whether the "Implemented" group is open for this document. */
export function writeImplementedOpen(
  memoryKey: string | undefined,
  open: boolean
): void {
  if (!memoryKey) return;
  try {
    localStorage.setItem(storageKey(memoryKey), open ? "open" : "closed");
  } catch {
    /* storage unavailable — the group still toggles for this session */
  }
}