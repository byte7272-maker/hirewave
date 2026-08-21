import { useApi } from "@/lib/useApi";
import { toneIconBg } from "@/pages/dashboard/components/tone";
import { DATA_CHANGED, type AppNotification } from "@/lib/backend";

const ICON: Record<string, string> = {
  match_found: "ri-focus-3-line",
  document_ready: "ri-file-text-line",
  application_submitted: "ri-send-plane-line",
  application_failed: "ri-error-warning-line",
  reauth_required: "ri-key-line",
  verification_warning: "ri-shield-line",
  security_exposure: "ri-shield-keyhole-line",
  system: "ri-notification-3-line",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function RecentActivity() {
  const notes = useApi<AppNotification[]>("/api/v1/notifications", [DATA_CHANGED]);
  const list = (notes.data ?? []).slice(0, 6);

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Recent activity</h2>
      </div>
      {list.length === 0 ? (
        <p className="px-5 py-8 text-sm text-foreground-500 text-center">No activity yet. Run a search to get started.</p>
      ) : (
        <ul className="divide-y divide-background-200">
          {list.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${toneIconBg.background}`}>
                <i className={`${ICON[a.type] || ICON.system} text-sm`}></i>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground-900">{a.message}</p>
              </div>
              <span className="text-[11px] text-foreground-400 whitespace-nowrap flex-shrink-0">{timeAgo(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
