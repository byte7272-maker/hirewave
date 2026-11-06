import { api } from "./api";
import { mockApprovals, mockPreparedMaterials } from "@/mocks/approvals";

// ---- Types ----

/** A prepared application parked by the assistant, awaiting the user's OK. */
export interface ApprovalItem {
  application_id: string | number;
  job_posting_id?: string | number;
  title?: string;
  company?: string;
  provider?: string;
  created_at?: string;
}

/** The server's response to an approve request. */
export interface ApproveResult {
  status: string;
  simulated?: boolean;
  detail?: string;
}

/** How the UI should react to an approve result. */
export interface ApproveOutcome {
  /** True when the card should be removed from the list. */
  removeCard: boolean;
  toast: { message: string; tone: "success" | "info" };
  /** Optional inline note kept on the card when it isn't removed. */
  note?: { tone: "warning" | "info"; text: string };
  /**
   * Present only when this outcome counts as a decision worth logging in the
   * "Recently decided" audit trail. Error-style results are not decisions.
   */
  decision?: { kind: "approved" | "declined"; outcome?: "submitted" | "simulated" | "held" };
}

// ---- API ----

export function listApprovals(): Promise<ApprovalItem[]> {
  if (__IS_PREVIEW__) return Promise.resolve(mockApprovals as ApprovalItem[]);
  return api<ApprovalItem[]>("/api/v1/auto-apply/approvals");
}

export function approveApplication(id: string | number): Promise<ApproveResult> {
  if (__IS_PREVIEW__) {
    return Promise.resolve({ status: "submitted", simulated: true, detail: "" });
  }
  return api<ApproveResult>(`/api/v1/auto-apply/approvals/${id}/approve`, { method: "POST" });
}

export function rejectApplication(id: string | number): Promise<void> {
  if (__IS_PREVIEW__) return Promise.resolve();
  return api<void>(`/api/v1/auto-apply/approvals/${id}/reject`, { method: "POST" });
}

// ---- Batch approve ----

/** One entry in the batch approve response. */
export interface BatchApproveResultItem {
  application_id: string | number;
  status: string;
  simulated?: boolean;
  detail?: string;
}

/** The server's response to POST /approvals/approve-all. */
export interface BatchApproveResponse {
  approved: number;
  total: number;
  results: BatchApproveResultItem[];
}

/**
 * Submit EVERY parked application in a single batch. The endpoint is owner-scoped
 * and each application still runs the real submit path (bound by the live-submit
 * gate), so per-application results can still come back as "needs your attention".
 *
 * `previewIds` is only used by preview builds to fabricate a per-application
 * "submitted" result so the whole flow can be exercised without a backend.
 */
export function approveAllApplications(
  previewIds: (string | number)[] = [],
): Promise<BatchApproveResponse> {
  if (__IS_PREVIEW__) {
    const results: BatchApproveResultItem[] = previewIds.map((id) => ({
      application_id: id,
      status: "submitted",
      simulated: true,
      detail: "",
    }));
    return Promise.resolve({ approved: results.length, total: results.length, results });
  }
  return api<BatchApproveResponse>("/api/v1/auto-apply/approvals/approve-all", { method: "POST" });
}

// ---- Display helpers ----

const PROVIDER_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  icims: "iCIMS",
  taleo: "Taleo",
  glassdoor: "Glassdoor",
  ziprecruiter: "ZipRecruiter",
};

/** Human label for a provider key, e.g. "greenhouse" → "Greenhouse". */
export function providerLabel(provider?: string): string {
  const key = (provider ?? "").trim().toLowerCase();
  if (!key) return "Provider";
  return PROVIDER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Title with a sensible fallback when the posting has no title. */
export function approvalTitle(item: { title?: string; job_posting_id?: string | number }): string {
  const t = item.title?.trim();
  if (t) return t;
  return `Job ${item.job_posting_id ?? "—"}`;
}

/** Company with a sensible fallback when it's missing. */
export function approvalCompany(item: { company?: string }): string {
  return item.company?.trim() || "—";
}

/** Relative "Prepared 3 min ago" label from created_at. */
export function preparedLabel(createdAt?: string): string {
  if (!createdAt) return "Prepared recently";
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "Prepared recently";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Prepared just now";
  if (mins < 60) return `Prepared ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Prepared ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Prepared ${days} day${days === 1 ? "" : "s"} ago`;
  return `Prepared ${new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

/**
 * Translate an approve result into what the card + toast should do. The card is
 * only removed for a genuine submit (real or simulated); every "held" state
 * keeps the card and surfaces a reassuring inline note.
 */
export function interpretApproveResult(item: ApprovalItem, result: ApproveResult): ApproveOutcome {
  const company = item.company?.trim() || "the employer";
  const label = providerLabel(item.provider);

  switch (result.status) {
    case "submitted":
      if (result.simulated) {
        return {
          removeCard: true,
          toast: {
            message: "Submitted (simulation — not sent to the employer).",
            tone: "info",
          },
          decision: { kind: "approved", outcome: "simulated" },
        };
      }
      return {
        removeCard: true,
        toast: { message: `Application submitted to ${company}.`, tone: "success" },
        decision: { kind: "approved", outcome: "submitted" },
      };

    case "filled_pending_submit":
      return {
        removeCard: false,
        toast: { message: "Prepared and held for review.", tone: "info" },
        note: {
          tone: "info",
          text: "Prepared and held for review — real sending isn't enabled yet.",
        },
        decision: { kind: "approved", outcome: "held" },
      };

    case "needs_login":
    case "captcha":
      return {
        removeCard: false,
        toast: { message: "That application needs your attention.", tone: "info" },
        note: {
          tone: "warning",
          text: `Your ${label} session needs attention — reconnect it and try again.`,
        },
      };

    case "needs_input":
    case "no_apply_button":
    case "error":
      return {
        removeCard: false,
        toast: { message: "Couldn't complete that application.", tone: "info" },
        note: {
          tone: "warning",
          text:
            result.detail?.trim() ||
            "The assistant couldn't finish this application. Review it and try again.",
        },
      };

    default:
      return {
        removeCard: false,
        toast: { message: "Nothing was submitted.", tone: "info" },
        note: {
          tone: "warning",
          text: result.detail?.trim() || "Unexpected response — nothing was sent.",
        },
      };
  }
}

// ---- Prepared materials (what the assistant used) ----

/** A single résumé or cover letter the assistant prepared. */
export interface PreparedMaterial {
  title?: string;
  content?: string;
  updated_at?: string;
}

/** The documents the assistant used for a parked application. */
export interface PreparedMaterials {
  resume?: PreparedMaterial | null;
  cover_letter?: PreparedMaterial | null;
}

/**
 * Fetch the résumé + cover letter the assistant prepared for one application.
 * Loaded lazily the first time the user opens a card's review panel. Preview
 * builds fall back to sample documents; live builds call the real endpoint.
 */
export function getPreparedMaterials(id: string | number): Promise<PreparedMaterials> {
  if (__IS_PREVIEW__) {
    const found = (mockPreparedMaterials as Record<string, PreparedMaterials>)[String(id)];
    return Promise.resolve(found ?? { resume: null, cover_letter: null });
  }
  return api<PreparedMaterials>(`/api/v1/auto-apply/approvals/${id}/prepared`);
}

/** True when at least one prepared document has usable content. */
export function hasPreparedDocuments(materials: PreparedMaterials | null): boolean {
  if (!materials) return false;
  return Boolean(materials.resume?.content?.trim() || materials.cover_letter?.content?.trim());
}

/** Rough word count for a prepared document body. */
export function wordCount(text?: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---- Sorting & filtering ----

export type ApprovalSortKey = "newest" | "oldest" | "company" | "title";

/** Ordering options for the queue, shared with the toolbar dropdown. */
export const APPROVAL_SORTS: { key: ApprovalSortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "company", label: "Company A–Z" },
  { key: "title", label: "Job title A–Z" },
];

function timeValue(value?: string): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Return a new, ordered copy of the queue for the given sort key. */
export function sortApprovals(items: ApprovalItem[], key: ApprovalSortKey): ApprovalItem[] {
  const copy = [...items];
  switch (key) {
    case "oldest":
      return copy.sort((a, b) => timeValue(a.created_at) - timeValue(b.created_at));
    case "company":
      return copy.sort(
        (a, b) =>
          approvalCompany(a).localeCompare(approvalCompany(b)) ||
          approvalTitle(a).localeCompare(approvalTitle(b)),
      );
    case "title":
      return copy.sort(
        (a, b) =>
          approvalTitle(a).localeCompare(approvalTitle(b)) ||
          approvalCompany(a).localeCompare(approvalCompany(b)),
      );
    case "newest":
    default:
      return copy.sort((a, b) => timeValue(b.created_at) - timeValue(a.created_at));
  }
}

/** Distinct provider keys present in the queue, sorted for the filter dropdown. */
export function providerKeys(items: ApprovalItem[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    const key = (item.provider ?? "").trim().toLowerCase();
    if (key) set.add(key);
  });
  return Array.from(set).sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
}

/**
 * The full outcome note / reason to store on an approval decision. Prefers the
 * inline note the outcome carries, otherwise summarises what actually happened.
 */
export function approveDecisionNote(item: ApprovalItem, outcome: ApproveOutcome): string {
  const note = outcome.note?.text?.trim();
  if (note) return note;
  const company = item.company?.trim() || "the employer";
  switch (outcome.decision?.outcome) {
    case "submitted":
      return `Submitted to ${company} via ${providerLabel(item.provider)}.`;
    case "simulated":
      return `Simulated submission to ${company} — nothing left your device.`;
    case "held":
      return "Prepared and held for review — not sent.";
    default:
      return `Approved — submitted to ${company}.`;
  }
}

/** Keep only items from one provider. "all" (or empty) passes everything through. */
export function filterByProvider(
  items: ApprovalItem[],
  provider: string,
): ApprovalItem[] {
  if (!provider || provider === "all") return items;
  return items.filter((item) => (item.provider ?? "").trim().toLowerCase() === provider);
}