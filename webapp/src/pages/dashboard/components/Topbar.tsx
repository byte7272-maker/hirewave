import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { initials, useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { DATA_CHANGED, type AppNotification } from "@/lib/backend";

interface TopbarProps {
  onMenuClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const ICONS: Record<string, string> = {
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

export default function Topbar({ onMenuClick, searchQuery, onSearchChange }: TopbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notes = useApi<AppNotification[]>("/api/v1/notifications", [DATA_CHANGED]);
  const list = notes.data ?? [];
  const unread = list.filter((n) => !n.is_read).length;

  return (
    <header className="sticky top-0 z-30 bg-background-50/90 backdrop-blur-md border-b border-background-200">
      <div className="px-4 md:px-6 lg:px-8 h-16 flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-md text-foreground-700 hover:bg-background-100 cursor-pointer"
          aria-label="Open menu"
        >
          <i className="ri-menu-line text-xl"></i>
        </button>

        <div className="relative flex-1 max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search matches, companies, skills..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-foreground-700 hover:text-foreground-950 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            Back to site
            <i className="ri-arrow-right-up-line"></i>
          </Link>

          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
              }}
              className="relative w-10 h-10 flex items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer"
              aria-label="Notifications"
            >
              <i className="ri-notification-3-line text-xl"></i>
              {unread > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 flex items-center justify-center rounded-full bg-accent-500"></span>
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-80 bg-background-50 border border-background-200 rounded-xl z-20 overflow-hidden animate-fade-in-up">
                  <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground-950">Notifications</span>
                    <span className="text-[11px] text-foreground-500">{unread} new</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {list.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-foreground-500 text-center">You&apos;re all caught up.</p>
                    ) : (
                      list.slice(0, 12).map((n) => (
                        <div key={n.id} className="w-full flex items-start gap-3 px-4 py-3 text-left">
                          <span className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 bg-background-200 text-foreground-700">
                            <i className={`${ICONS[n.type] || ICONS.system} text-sm`}></i>
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-foreground-900">{n.message}</span>
                            <span className="block text-xs text-foreground-500 mt-0.5">{timeAgo(n.created_at)}</span>
                          </span>
                          {!n.is_read && <span className="w-2 h-2 rounded-full bg-accent-500 mt-2 flex-shrink-0"></span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setProfileOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 rounded-full cursor-pointer py-1 pl-1 pr-2 hover:bg-background-100 transition-colors"
              aria-label="Account menu"
            >
              <span className="w-9 h-9 flex items-center justify-center rounded-full bg-primary-500 text-background-50 text-sm font-semibold">
                {initials(user?.full_name ?? "", user?.email ?? "U")}
              </span>
              <span className="hidden md:block text-sm font-semibold text-foreground-900 whitespace-nowrap">
                {(user?.full_name || user?.email || "").split(" ")[0]}
              </span>
              <i className="ri-arrow-down-s-line hidden md:block text-foreground-500"></i>
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-background-50 border border-background-200 rounded-xl z-20 overflow-hidden animate-fade-in-up">
                  <div className="px-4 py-3 border-b border-background-200">
                    <div className="text-sm font-semibold text-foreground-950">{user?.full_name || "Account"}</div>
                    <div className="text-xs text-foreground-500 truncate">{user?.email}</div>
                  </div>
                  <div className="p-1">
                    <Link to="/dashboard/settings" onClick={() => setProfileOpen(false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer">
                      Settings
                    </Link>
                    <button
                      onClick={async () => {
                        await logout();
                        navigate("/");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer text-left"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
