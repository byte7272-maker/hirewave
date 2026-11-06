import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toneIconBg } from "@/pages/dashboard/components/tone";
import { logout } from "@/lib/auth";
import { useJumpBackIn } from "@/hooks/useJumpBackInStore";
import { openRecentlyViewedEntry } from "@/lib/jumpBackIn";
import { useOnboarding } from "@/pages/dashboard/onboarding/OnboardingProvider";
import { getFirstName, getInitials, useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useNotifications";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { notificationMeta, notificationText, type Notification } from "@/lib/notifications";
import {
  PAID_PLANS_ENABLED,
  UPGRADE_COMING_SOON_MESSAGE,
} from "@/lib/pricingFlags";
import { useToast } from "@/components/base/ToastProvider";
import SessionStatusChip from "@/components/feature/SessionStatusChip";
import ThemeToggle from "@/components/base/ThemeToggle";

function formatNotifTime(n: Notification): string {
  if (n.created_at) {
    const d = new Date(n.created_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  return (n as { time?: string }).time ?? "";
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface TopbarProps {
  onMenuClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  connectedProviders?: string[];
  unreadNotifications?: number;
}

export default function Topbar({
  onMenuClick,
  searchQuery,
  onSearchChange,
  connectedProviders = [],
  unreadNotifications = 0,
}: TopbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { featured: jumpBackTarget } = useJumpBackIn();
  const { user } = useCurrentUser();
  const { open: openSetup } = useOnboarding();
  const { items, loading, error, unreadCount, markRead, markAllRead } = useNotifications();
  const { showToast } = useToast();
  const { installed, outdated, storeUrl } = useExtensionInstall();
  const fullName = user?.full_name ?? "";
  const initials = fullName ? getInitials(fullName) : "";
  const firstName = fullName ? getFirstName(fullName) : "";

  // Cmd/Ctrl + K focuses the global search from anywhere on the dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await logout();
    navigate("/");
  }

  /**
   * Upgrade — TEMPORARY coming-soon reminder while paid plans are being priced.
   * Behind `PAID_PLANS_ENABLED` the real behavior (go to the pricing section on
   * the marketing site) is preserved and returns by flipping the flag.
   */
  function handleUpgrade() {
    if (PAID_PLANS_ENABLED) {
      navigate({
        pathname: "/",
        hash: "#pricing",
      });
      return;
    }
    showToast(UPGRADE_COMING_SOON_MESSAGE, "info");
  }

  /** Jump straight to the store when a listing exists, otherwise the extension page. */
  function handleExtensionUpdate() {
    if (storeUrl) {
      window.open(storeUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate("/extension");
    }
  }

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
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search matches, companies, skills..."
            className="w-full h-10 pl-9 pr-14 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
          <kbd className="hidden md:inline-flex items-center gap-0.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-mono font-medium text-foreground-400 bg-background-50 border border-background-200 rounded px-1.5 py-0.5">
            <i className="ri-command-line text-[11px]"></i>K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          {jumpBackTarget && (
            <button
              type="button"
              onClick={() => openRecentlyViewedEntry(navigate, jumpBackTarget)}
              title={`Jump back in to ${jumpBackTarget.title || "the last thing you opened"}`}
              className="inline-flex items-center gap-1.5 h-10 px-2.5 md:px-3 rounded-md text-sm font-medium text-foreground-700 bg-background-100 border border-background-200 hover:bg-background-200 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-history-line text-accent-600"></i>
              <span className="hidden lg:inline">Jump back in</span>
            </button>
          )}

          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-foreground-700 hover:text-foreground-950 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            Back to site
            <i className="ri-arrow-right-up-line"></i>
          </Link>

          <button
            type="button"
            onClick={handleUpgrade}
            title={
              PAID_PLANS_ENABLED
                ? "Upgrade your plan"
                : "Paid plans are coming soon"
            }
            className="relative hidden sm:inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 pl-4 pr-3 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            Upgrade
            {!PAID_PLANS_ENABLED && (
              <span className="inline-flex items-center rounded-full bg-background-50/25 text-background-50 dark:text-foreground-950 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                Coming soon
              </span>
            )}
          </button>

          {(connectedProviders.length > 0 || unreadNotifications > 0) && (
            <div className="hidden md:flex items-center gap-1.5">
              {connectedProviders.length > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-700 bg-background-100 border border-background-200 rounded-full px-3 py-1 whitespace-nowrap cursor-help"
                  title={
                    connectedProviders.length > 2
                      ? connectedProviders.map(capitalize).join(", ")
                      : undefined
                  }
                >
                  <i className="ri-link-m text-secondary-700"></i>
                  {connectedProviders.length > 2
                    ? `${connectedProviders.length} apps connected`
                    : connectedProviders.map(capitalize).join(", ")}
                </span>
              )}
              {unreadNotifications > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-100 text-accent-900 rounded-full px-3 py-1 whitespace-nowrap">
                  <i className="ri-notification-3-line"></i>
                  {unreadNotifications} unread
                </span>
              )}
            </div>
          )}

          {installed && outdated && (
            <button
              type="button"
              onClick={handleExtensionUpdate}
              title="A newer version of the extension is available"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-100 text-accent-900 border border-accent-200 rounded-full px-3 py-1.5 hover:bg-accent-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line"></i>
              <span className="hidden md:inline">Update extension</span>
            </button>
          )}

          <ThemeToggle />

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
              {unreadNotifications > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 flex items-center justify-center rounded-full bg-accent-500"></span>
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-80 bg-background-50 border border-background-200 rounded-xl z-20 overflow-hidden animate-fade-in-up">
                  <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground-950">Notifications</span>
                    <button
                      onClick={markAllRead}
                      disabled={unreadCount === 0}
                      className="text-[11px] font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                      <div className="px-4 py-8 text-sm text-foreground-500 flex items-center justify-center gap-2">
                        <i className="ri-loader-4-line animate-spin"></i>
                        Loading…
                      </div>
                    ) : error ? (
                      <div className="px-4 py-8 text-sm text-foreground-500 text-center">
                        {error}
                      </div>
                    ) : items.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-foreground-500 text-center">
                        No notifications yet.
                      </div>
                    ) : (
                      items.map((n) => {
                        const meta = notificationMeta(n.type);
                        const unread = n.unread || !n.read;
                        return (
                          <button
                            key={n.id}
                            onClick={() => unread && markRead(n.id)}
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-background-100 text-left cursor-pointer"
                          >
                            <span
                              className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${toneIconBg[meta.tone]}`}
                            >
                              <i className={`${meta.icon} text-sm`}></i>
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-foreground-900">
                                {notificationText(n)}
                              </span>
                              <span className="block text-xs text-foreground-500 mt-0.5">
                                {formatNotifTime(n)}
                              </span>
                            </span>
                            {unread && (
                              <span className="w-2 h-2 flex items-center justify-center rounded-full bg-accent-500 mt-2 flex-shrink-0"></span>
                            )}
                          </button>
                        );
                      })
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
                {initials || <i className="ri-user-line text-base"></i>}
              </span>
              <span className="hidden md:block text-sm font-semibold text-foreground-900 whitespace-nowrap">
                {firstName}
              </span>
              <i className="ri-arrow-down-s-line hidden md:block text-foreground-500"></i>
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-background-50 border border-background-200 rounded-xl z-20 overflow-hidden animate-fade-in-up">
                  <div className="px-4 py-3 border-b border-background-200">
                    <div className="text-sm font-semibold text-foreground-950">{fullName}</div>
                    {user?.email && (
                      <div className="text-xs text-foreground-500">{user.email}</div>
                    )}
                  </div>
                  <SessionStatusChip />
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        openSetup();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-flag-line text-foreground-500"></i>
                      Setup
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/dashboard/profile");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/dashboard/settings");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/extension");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-puzzle-2-line text-foreground-500"></i>
                      <span className="flex-1 text-left">Get the extension</span>
                      {installed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-secondary-500"></span>
                          {outdated ? "Update" : "Installed"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background-100 text-foreground-500 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-foreground-300"></span>
                          Not installed
                        </span>
                      )}
                    </button>
                    <a
                      href="mailto:support@projectharbor.ai"
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Help center
                    </a>
                    <button
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {signingOut ? "Signing out…" : "Sign out"}
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