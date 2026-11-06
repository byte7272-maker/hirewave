import { useState } from "react";

type QueueItem = {
  id: string;
  role: string;
  co: string;
  via: string;
  status: "pending" | "approved" | "rejected";
};

const INITIAL: QueueItem[] = [
  { id: "a1", role: "Product Designer", co: "Figma", via: "LinkedIn Easy Apply", status: "approved" },
  { id: "a2", role: "Frontend Engineer", co: "Vercel", via: "Indeed", status: "pending" },
  { id: "a3", role: "UX Researcher", co: "Notion", via: "Gmail", status: "pending" },
];

export default function AutomationMock() {
  const [queue, setQueue] = useState<QueueItem[]>(INITIAL);

  const act = (id: string, status: "approved" | "rejected") => {
    setQueue((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status } : it))
    );
  };

  const pending = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
        </div>
        <span className="text-xs font-mono text-foreground-500">
          apply queue · {pending} awaiting your approval
        </span>
      </div>

      <div className="p-4 space-y-2">
        {queue.map((q) => (
          <div
            key={q.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-background-100/60 border border-background-200"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
              {q.co[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground-950 truncate">
                {q.role} <span className="text-foreground-500 font-normal">· {q.co}</span>
              </div>
              <div className="text-xs text-foreground-600 truncate">
                via {q.via}
              </div>
            </div>

            {q.status === "pending" ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => act(q.id, "approved")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 text-xs font-semibold hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-check-line"></i>
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => act(q.id, "rejected")}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-background-50 border border-background-300 text-foreground-500 hover:border-accent-400 hover:text-accent-700 transition-colors cursor-pointer"
                  aria-label="Reject"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
            ) : (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded flex-shrink-0 ${
                  q.status === "approved"
                    ? "bg-primary-100 text-primary-900"
                    : "bg-secondary-100 text-secondary-900"
                }`}
              >
                <i
                  className={
                    q.status === "approved"
                      ? "ri-send-plane-line"
                      : "ri-close-line"
                  }
                ></i>
                {q.status === "approved" ? "Submitted" : "Skipped"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}