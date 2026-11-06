import { useEffect, useMemo, useRef, useState } from "react";
import { approvalCompany, approvalTitle, providerLabel } from "@/lib/approvals";
import {
  decisionDayKey,
  decisionDayLabel,
  decisionReason,
  decisionsToCsv,
  decisionTimeLabel,
  startOfWeekMs,
  type ApprovalDecision,
} from "@/lib/approvalDecisions";
import { useApprovalDecisions } from "@/hooks/useApprovalDecisions";
import { useToast } from "@/components/base/ToastProvider";
import { Button, Card, SectionHeader } from "@/components/base";

const OUTCOME_BADGE: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Sent", cls: "bg-primary-100 text-primary-800" },
  simulated: { label: "Simulation", cls: "bg-secondary-100 text-secondary-900" },
  held: { label: "Held for review", cls: "bg-accent-100 text-accent-900" },
};

const DAY_MS = 86400000;

type DecisionFilter = "all" | "approved" | "declined";
type SummaryRange = "week" | "30d";

interface DecisionGroup {
  key: string;
  label: string;
  items: ApprovalDecision[];
}

interface ProviderTally {
  key: string;
  label: string;
  approved: number;
  declined: number;
  total: number;
  /** Approved this week minus approved last week. */
  delta: number;
}

/** A tiny up/down/flat arrow signalling week-over-week movement. */
function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span
        className="inline-flex items-center text-primary-700"
        title={`Up ${delta} vs last week`}
      >
        <i className="ri-arrow-up-line text-sm"></i>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        className="inline-flex items-center text-foreground-500"
        title={`Down ${Math.abs(delta)} vs last week`}
      >
        <i className="ri-arrow-down-line text-sm"></i>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center text-foreground-400"
      title="No change vs last week"
    >
      <i className="ri-subtract-line text-sm"></i>
    </span>
  );
}

/** A single decision row that expands to reveal the full outcome note/reason. */
function DecisionRow({ decision }: { decision: ApprovalDecision }) {
  const [open, setOpen] = useState(false);
  const approved = decision.decision === "approved";
  const badge = decision.outcome ? OUTCOME_BADGE[decision.outcome] : undefined;
  const reason = decisionReason(decision);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 py-3 text-left cursor-pointer group"
      >
        <span
          className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${
            approved ? "bg-primary-100 text-primary-700" : "bg-background-200 text-foreground-500"
          }`}
        >
          <i className={approved ? "ri-check-line" : "ri-close-line"}></i>
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground-950">
              {approvalTitle(decision)}
            </span>
            <span className="text-xs text-foreground-500">{approvalCompany(decision)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`text-xs font-semibold ${
                approved ? "text-primary-700" : "text-foreground-600"
              }`}
            >
              {approved ? "Approved" : "Declined"}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground-500 whitespace-nowrap">
              <i className="ri-time-line"></i>
              {decisionTimeLabel(decision.decided_at)}
            </span>
            {decision.provider && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                {providerLabel(decision.provider)}
              </span>
            )}
            {badge && (
              <span
                className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}
              >
                {badge.label}
              </span>
            )}
          </div>
        </div>

        <span className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 group-hover:text-foreground-950 group-hover:bg-background-200 transition-colors flex-shrink-0">
          <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </span>
      </button>

      {open && (
        <div className="ml-11 mb-3 rounded-lg bg-background-50 border border-background-200 px-3 py-2.5 animate-fade-in-up">
          <div className="flex items-center gap-1.5 mb-1">
            <i className="ri-sticky-note-line text-xs text-foreground-500"></i>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
              Outcome note
            </span>
          </div>
          <p className="text-xs text-foreground-700 leading-relaxed">{reason}</p>
          <p className="text-[11px] text-foreground-500 mt-1.5">
            Recorded {new Date(decision.decided_at).toLocaleString()}
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * The "Recently decided" audit trail under the queue. It records every approve
 * and decline the user makes (kept locally), grouped by day with small date
 * separators so longer histories stay scannable. Filter chips slice the log by
 * decision; a summary at the top toggles between this week and the last 30
 * days and breaks approvals down by board with a week-over-week trend arrow.
 * Rows expand to show their outcome note, and the whole log can be copied or
 * downloaded as CSV. Hidden until there's a decision to show.
 */
export default function ApprovalsHistory() {
  const { decisions, clear } = useApprovalDecisions();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [range, setRange] = useState<SummaryRange>("week");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Close the export menu on any click outside it.
  useEffect(() => {
    if (!exportOpen) return;
    function onDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const counts = useMemo(() => {
    let approved = 0;
    let declined = 0;
    for (const d of decisions) {
      if (d.decision === "approved") approved += 1;
      else declined += 1;
    }
    return { all: decisions.length, approved, declined };
  }, [decisions]);

  const summary = useMemo(() => {
    const now = Date.now();
    const rangeStart = range === "week" ? startOfWeekMs() : now - 30 * DAY_MS;
    const weekStart = startOfWeekMs();
    const prevWeekStart = weekStart - 7 * DAY_MS;

    const byProvider = new Map<string, { approved: number; declined: number }>();
    // Approved counts for this week and last week, for the trend arrows.
    const thisWeek = new Map<string, number>();
    const lastWeek = new Map<string, number>();
    let approved = 0;
    let declined = 0;

    for (const d of decisions) {
      const t = new Date(d.decided_at).getTime();
      const key = (d.provider ?? "").trim().toLowerCase() || "unknown";

      if (t >= weekStart) {
        if (d.decision === "approved") thisWeek.set(key, (thisWeek.get(key) ?? 0) + 1);
      } else if (t >= prevWeekStart) {
        if (d.decision === "approved") lastWeek.set(key, (lastWeek.get(key) ?? 0) + 1);
      }

      if (t < rangeStart) continue;
      if (d.decision === "approved") approved += 1;
      else declined += 1;
      const entry = byProvider.get(key) ?? { approved: 0, declined: 0 };
      if (d.decision === "approved") entry.approved += 1;
      else entry.declined += 1;
      byProvider.set(key, entry);
    }

    const providers: ProviderTally[] = Array.from(byProvider.entries())
      .map(([key, v]) => ({
        key,
        label: key === "unknown" ? "Other" : providerLabel(key),
        approved: v.approved,
        declined: v.declined,
        total: v.approved + v.declined,
        delta: (thisWeek.get(key) ?? 0) - (lastWeek.get(key) ?? 0),
      }))
      .sort(
        (a, b) =>
          b.approved - a.approved ||
          b.total - a.total ||
          a.label.localeCompare(b.label),
      );
    return { approved, declined, total: approved + declined, providers };
  }, [decisions, range]);

  const maxApproved = useMemo(
    () => Math.max(1, ...summary.providers.map((p) => p.approved)),
    [summary.providers],
  );

  const filtered = useMemo(
    () => (filter === "all" ? decisions : decisions.filter((d) => d.decision === filter)),
    [decisions, filter],
  );

  const groups = useMemo<DecisionGroup[]>(() => {
    const out: DecisionGroup[] = [];
    for (const decision of filtered) {
      const key = decisionDayKey(decision.decided_at);
      let group = out[out.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: decisionDayLabel(decision.decided_at), items: [] };
        out.push(group);
      }
      group.items.push(decision);
    }
    return out;
  }, [filtered]);

  const rangeLabel = range === "week" ? "this week" : "in the last 30 days";

  async function copyCsv() {
    const csv = decisionsToCsv(decisions);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
      } else {
        const ta = document.createElement("textarea");
        ta.value = csv;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast(
        `Copied ${decisions.length} decision${decisions.length === 1 ? "" : "s"} as CSV.`,
        "success",
      );
    } catch {
      showToast("Couldn't copy the log — your browser blocked clipboard access.", "error");
    }
  }

  function downloadCsv() {
    try {
      const csv = decisionsToCsv(decisions);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decision-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        `Downloaded ${decisions.length} decision${decisions.length === 1 ? "" : "s"} as CSV.`,
        "success",
      );
    } catch {
      showToast("Couldn't save the file — please try again.", "error");
    }
  }

  if (decisions.length === 0) return null;

  const chips: { key: DecisionFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "declined", label: "Declined", count: counts.declined },
  ];

  const ranges: { key: SummaryRange; label: string }[] = [
    { key: "week", label: "This week" },
    { key: "30d", label: "Last 30 days" },
  ];

  return (
    <Card
      surface="tinted"
      className="animate-fade-in-up overflow-hidden"
      style={{ animationDelay: "0.1s" }}
    >
      <SectionHeader
        icon="ri-history-line"
        tone="foreground"
        title="Recently decided"
        subtitle="A record of what you approved or declined — nothing here was sent without your OK."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div ref={exportRef} className="relative">
              <Button
                variant="outline"
                size="sm"
                icon="ri-download-2-line"
                trailingIcon={exportOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}
                onClick={() => setExportOpen((v) => !v)}
              >
                Export log
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-lg bg-background-50 border border-background-200 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      void copyCsv();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-foreground-700 hover:bg-background-100 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-copy-2-line"></i>
                    Copy CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      downloadCsv();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-foreground-700 hover:bg-background-100 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-download-line"></i>
                    Download .csv file
                  </button>
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" icon="ri-delete-bin-6-line" onClick={clear}>
              Clear log
            </Button>
          </div>
        }
      />

      <div className="p-4 md:p-5">
      <div className="mt-3 rounded-xl bg-background-50 border border-background-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-background-100 border border-background-200 rounded-full px-1 py-1">
            {ranges.map((r) => {
              const active = range === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-foreground-900 text-background-50 dark:text-foreground-950"
                      : "text-foreground-600 hover:text-foreground-950"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              {summary.approved} approved
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground-400"></span>
              {summary.declined} declined
            </span>
          </div>
        </div>

        {summary.providers.length > 0 ? (
          <div className="mt-2.5 pt-2.5 border-t border-background-200">
            <div className="flex items-center gap-1.5 mb-2">
              <i className="ri-bar-chart-horizontal-line text-xs text-foreground-500"></i>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
                Approved by board {rangeLabel}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {summary.providers.map((p) => (
                <div key={p.key} className="flex items-center gap-2.5">
                  <span className="text-xs font-medium text-foreground-700 w-28 truncate whitespace-nowrap">
                    {p.label}
                  </span>
                  <span className="flex-1 h-1.5 rounded-full bg-background-200 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-primary-500"
                      style={{ width: `${(p.approved / maxApproved) * 100}%` }}
                    ></span>
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-foreground-700 whitespace-nowrap">
                    {p.approved}
                    {p.declined > 0 && (
                      <span className="text-foreground-500 font-normal"> · {p.declined}✕</span>
                    )}
                  </span>
                  <TrendArrow delta={p.delta} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-foreground-500 flex items-center gap-1.5">
              <i className="ri-arrow-up-line text-primary-700"></i>
              <i className="ri-arrow-down-line text-foreground-500"></i>
              trend vs last week
            </p>
          </div>
        ) : (
          <p className="mt-2.5 pt-2.5 border-t border-background-200 text-[11px] text-foreground-500">
            No decisions {rangeLabel} yet.
          </p>
        )}
      </div>

      <div className="mt-3 inline-flex items-center gap-1 bg-background-50 border border-background-200 rounded-full px-1 py-1">
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-950"
              }`}
            >
              {chip.label}
              <span
                className={`text-[10px] font-semibold tabular-nums ${
                  active ? "text-background-50/80 dark:text-foreground-950/70" : "text-foreground-500"
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 py-8 text-center">
          <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-background-50 text-foreground-500 mb-2">
            <i className="ri-filter-off-line"></i>
          </div>
          <p className="text-xs text-foreground-500">
            No {filter === "approved" ? "approvals" : "declines"} in your history yet.
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-foreground-500 flex items-center gap-1.5">
            <i className="ri-cursor-line"></i>
            Tap any row to see the full outcome note.
          </p>
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-3 pt-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 whitespace-nowrap">
                  {group.label}
                </span>
                <span className="flex-1 h-px bg-background-200"></span>
                <span className="text-[11px] text-foreground-500 whitespace-nowrap">
                  {group.items.length}
                </span>
              </div>
              <ul className="divide-y divide-background-200">
                {group.items.map((decision) => (
                  <DecisionRow
                    key={`${decision.application_id}-${decision.decided_at}`}
                    decision={decision}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      </div>
    </Card>
  );
}