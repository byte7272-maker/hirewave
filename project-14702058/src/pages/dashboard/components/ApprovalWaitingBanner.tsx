import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApprovals } from "@/hooks/useApprovalsStore";
import { approvalCompany, approvalTitle } from "@/lib/approvals";

const ROTATE_MS = 6000;

/**
 * Dashboard home banner shown only while applications are parked for approval.
 * Reads the shared approvals store, so it appears/disappears the moment the
 * count changes on the Approvals screen. It rotates through the waiting
 * applications and links straight to the one currently shown (highlighted +
 * scrolled into view) rather than the bare list.
 */
export default function ApprovalWaitingBanner() {
  const { pendingCount, items } = useApprovals();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const total = items.length;

  // Restart the rotation whenever the set of waiting items changes size.
  useEffect(() => {
    setIndex(0);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || paused) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % total), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [total, paused]);

  if (pendingCount <= 0) return null;

  const activeIndex = total > 0 ? index % total : 0;
  const target = items[activeIndex];
  const to = target
    ? `/dashboard/approvals?focus=${target.application_id}`
    : "/dashboard/approvals";

  const label =
    pendingCount === 1
      ? "1 application waiting for your approval"
      : `${pendingCount} applications waiting for your approval`;

  return (
    <Link
      to={to}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="animate-fade-in-up group flex items-center gap-4 rounded-2xl bg-primary-100/70 border border-primary-200 p-4 hover:bg-primary-100 transition-colors cursor-pointer"
      style={{ animationDelay: "0.02s" }}
    >
      <span className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
        <i className="ri-shield-check-line text-xl"></i>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm md:text-base font-semibold text-foreground-950">{label}</p>
        <p className="text-xs md:text-sm text-foreground-600 mt-0.5">
          Review each one — nothing is sent until you approve it.
        </p>
        {target && (
          <p className="text-xs text-foreground-500 mt-1 truncate">
            Next up: <span className="font-medium text-foreground-700">{approvalTitle(target)}</span>
            {" · "}
            {approvalCompany(target)}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 whitespace-nowrap">
          Review
          <i className="ri-arrow-right-line transition-transform group-hover:translate-x-0.5"></i>
        </span>
        {total > 1 &&
          (total <= 8 ? (
            <div className="flex items-center gap-1">
              {items.map((it, i) => (
                <span
                  key={String(it.application_id)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === activeIndex ? "w-4 bg-primary-500" : "w-1.5 bg-primary-300/80"
                  }`}
                ></span>
              ))}
            </div>
          ) : (
            <span className="text-xs font-medium text-foreground-500 tabular-nums whitespace-nowrap">
              {activeIndex + 1} / {total}
            </span>
          ))}
      </div>
    </Link>
  );
}