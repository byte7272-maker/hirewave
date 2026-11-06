// A lightweight, local audit log of the user's approval decisions. It exists to
// reinforce the product promise — every decision the user makes is recorded and
// reviewable, and nothing is ever sent without their explicit OK.

export type ApprovalDecisionKind = "approved" | "declined";

/** For approvals: how the submit actually resolved. */
export type ApprovalDecisionOutcome = "submitted" | "simulated" | "held";

export interface ApprovalDecision {
  application_id: string | number;
  title?: string;
  company?: string;
  provider?: string;
  decision: ApprovalDecisionKind;
  outcome?: ApprovalDecisionOutcome;
  /** Full human-readable outcome note / reason captured when it was recorded. */
  note?: string;
  decided_at: string;
}

const STORAGE_KEY = "hw_approval_decisions";
export const MAX_DECISIONS = 20;

/** Read the saved decisions, tolerating missing or corrupt storage. */
export function readDecisions(): ApprovalDecision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ApprovalDecision[]) : [];
  } catch {
    return [];
  }
}

/** Persist decisions, ignoring quota or availability errors. */
export function writeDecisions(list: ApprovalDecision[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage may be unavailable (private mode) — the in-memory log still works.
  }
}

/** Relative "5 min ago" style label for a decision timestamp. */
export function decisionTimeLabel(decidedAt: string): string {
  const t = new Date(decidedAt).getTime();
  if (Number.isNaN(t)) return "just now";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(decidedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Stable local-day key (e.g. 2026-2-5) used to group decisions by day. */
export function decisionDayKey(decidedAt: string): string {
  const d = new Date(decidedAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Friendly day separator label — "Today", "Yesterday", or a short date. */
export function decisionDayLabel(decidedAt: string): string {
  const d = new Date(decidedAt);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Epoch ms for the start of the current week (Monday 00:00, local time). */
export function startOfWeekMs(now: Date = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/**
 * The full outcome note / reason for a decision. Prefers the captured note and
 * falls back to a sensible summary derived from the fields, so older rows that
 * predate notes still read cleanly.
 */
export function decisionReason(decision: ApprovalDecision): string {
  const note = decision.note?.trim();
  if (note) return note;
  const company = decision.company?.trim() || "the employer";
  if (decision.decision === "declined") {
    return "Declined by you — nothing was sent to the employer.";
  }
  switch (decision.outcome) {
    case "submitted":
      return `Submitted to ${company}.`;
    case "simulated":
      return "Approved in simulation mode — nothing left your device.";
    case "held":
      return "Prepared and held for review — not sent.";
    default:
      return "Approved and recorded in your audit trail.";
  }
}

/** Escape a single CSV cell — quotes, commas, and newlines wrapped safely. */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Render the decision log as a CSV string for export/copy. */
export function decisionsToCsv(list: ApprovalDecision[]): string {
  const header = ["decided_at", "decision", "outcome", "title", "company", "provider", "note"];
  const rows = list.map((d) => [
    d.decided_at,
    d.decision,
    d.outcome ?? "",
    d.title ?? "",
    d.company ?? "",
    d.provider ?? "",
    d.note ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}