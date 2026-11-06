import { useSyncExternalStore } from "react";
import {
  MAX_DECISIONS,
  readDecisions,
  writeDecisions,
  type ApprovalDecision,
} from "@/lib/approvalDecisions";

// Shared, localStorage-backed log of approval decisions so the "Recently
// decided" audit trail updates the instant a card is approved or declined.

let decisions: ApprovalDecision[] = readDecisions();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return decisions;
}

function setDecisions(next: ApprovalDecision[]) {
  decisions = next;
  writeDecisions(next);
  emit();
}

/** Record a decision, de-duping by application id and keeping the newest first. */
export function recordDecision(decision: ApprovalDecision) {
  const rest = decisions.filter(
    (d) => String(d.application_id) !== String(decision.application_id),
  );
  setDecisions([decision, ...rest].slice(0, MAX_DECISIONS));
}

/** Wipe the local audit log. */
export function clearDecisions() {
  setDecisions([]);
}

export function useApprovalDecisions() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { decisions: list, record: recordDecision, clear: clearDecisions };
}