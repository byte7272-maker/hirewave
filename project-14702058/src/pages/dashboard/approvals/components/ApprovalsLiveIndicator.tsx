import { useEffect, useState } from "react";
import { useApprovalsPollStatus } from "@/hooks/useApprovalsPoll";

const RING_OUTER = 22;
const RING_INNER = 15;

/**
 * A quiet "live" pill shown near the queue. A thin ring fills across each cycle
 * while the text counts down to the next silent background refresh, so the user
 * can trust at a glance that the list is keeping itself current.
 */
export default function ApprovalsLiveIndicator() {
  const { nextAt, intervalMs } = useApprovalsPollStatus();
  const [, setTick] = useState(0);

  // Re-render twice a second so the ring fills smoothly and the count is fresh.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);

  let text = "Live · auto-refreshing";
  let percent = 0;
  if (nextAt && intervalMs > 0) {
    const remaining = Math.max(0, nextAt - Date.now());
    const elapsed = Math.max(0, intervalMs - remaining);
    percent = Math.min(100, (elapsed / intervalMs) * 100);
    const left = Math.ceil(remaining / 1000);
    text = left > 0 ? `Live · next check in ${left}s` : "Live · checking now…";
  }

  return (
    <div className="flex items-center justify-end">
      <span className="inline-flex items-center gap-2.5 text-xs font-medium text-foreground-500 bg-background-100/60 border border-background-200 pl-2 pr-3 py-1.5 rounded-full whitespace-nowrap">
        <span
          className="inline-flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: RING_OUTER,
            height: RING_OUTER,
            background: `conic-gradient(oklch(var(--primary-500)) ${percent}%, oklch(var(--background-200)) 0)`,
          }}
        >
          <span
            className="rounded-full bg-background-100"
            style={{ width: RING_INNER, height: RING_INNER }}
          ></span>
        </span>
        {text}
      </span>
    </div>
  );
}