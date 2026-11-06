import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listActions, type AssistantAction } from "@/lib/assistant";

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function iconFor(type?: string) {
  switch (type) {
    case "prepare_drafts":
      return "ri-file-text-line";
    case "autofill":
      return "ri-checkbox-multiple-line";
    case "submit":
      return "ri-send-plane-line";
    case "consent":
      return "ri-shield-check-line";
    default:
      return "ri-magic-line";
  }
}

export default function ActivityLog() {
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setActions((await listActions()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading activity…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
        <i className="ri-error-warning-line text-base mt-0.5"></i>
        <div className="flex-1">{error}</div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
        >
          Retry
        </button>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-14 text-center">
        <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
          <i className="ri-history-line text-2xl"></i>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground-900">No activity yet</p>
        <p className="mt-1 text-xs text-foreground-500">
          Once you turn on a permission, the assistant&apos;s actions will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {actions.map((a, i) => (
        <li
          key={a.id ?? i}
          className="rounded-xl bg-background-100/60 border border-background-200 px-4 py-3 flex items-start gap-3"
        >
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 text-foreground-600 flex-shrink-0">
            <i className={`${iconFor(a.type)} text-base`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground-900">
              {a.description ?? a.type ?? "Assistant action"}
            </p>
            {(a.job_title || a.company) && (
              <p className="text-xs text-foreground-500 mt-0.5 truncate">
                {[a.job_title, a.company].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <span className="text-[11px] text-foreground-400 whitespace-nowrap flex-shrink-0">
            {formatDate(a.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}