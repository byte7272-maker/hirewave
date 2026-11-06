import { useState } from "react";
import { notificationMeta, notificationText, type Notification } from "@/lib/notifications";
import { startOfCurrentWeek } from "@/lib/applications";
import { toneIconBg } from "@/pages/dashboard/components/tone";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import { Badge, Card } from "@/components/base";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface RecentActivityProps {
  items: Notification[];
  loading?: boolean;
}

export default function RecentActivity({ items, loading = false }: RecentActivityProps) {
  const [thisWeekOnly, setThisWeekOnly] = useState(false);

  const visible = thisWeekOnly
    ? items.filter((n) => {
        if (!n.created_at) return false;
        return new Date(n.created_at) >= startOfCurrentWeek();
      })
    : items;
  const shown = visible.slice(0, 5);

  return (
    <Card surface="tinted" className="overflow-hidden">
      <PanelHeader
        icon="ri-pulse-line"
        tone="accent"
        title="Recent activity"
        subtitle="Your latest updates"
        action={
          <label className="inline-flex items-center gap-2 text-xs text-foreground-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={thisWeekOnly}
              onChange={(e) => setThisWeekOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            This week
          </label>
        }
      />

      {loading && items.length === 0 ? (
        <div className="px-5 py-10 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-2">
            <i className="ri-notification-3-line text-lg"></i>
          </div>
          <p className="text-sm text-foreground-600">No recent activity yet.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-2">
            <i className="ri-calendar-line text-lg"></i>
          </div>
          <p className="text-sm text-foreground-600">No activity this week.</p>
        </div>
      ) : (
        <ul className="divide-y divide-background-200">
          {shown.map((n) => {
            const meta = notificationMeta(n.type);
            return (
              <li key={n.id} className="flex items-start gap-3 px-5 py-3.5">
                <span
                  className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${toneIconBg[meta.tone]}`}
                >
                  <i className={`${meta.icon} text-sm`}></i>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground-900">{notificationText(n)}</p>
                </div>
                <Badge tone="foreground" variant="soft" size="sm" className="flex-shrink-0">
                  {timeAgo(n.created_at)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}