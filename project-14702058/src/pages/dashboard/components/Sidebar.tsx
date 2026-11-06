import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { userProfile } from "@/mocks/dashboard";
import { getInitials, useCurrentUser } from "@/hooks/useCurrentUser";
import { useBrandName } from "@/hooks/useBranding";
import { useApprovals } from "@/hooks/useApprovalsStore";
import { useEvidenceDraftStatus } from "@/hooks/useEvidenceDraftStatus";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";

interface NavItem {
  label: string;
  icon: string;
  to: string;
  badge?: string;
  /** When set, the badge is drawn from live state instead of a static label. */
  badgeKey?: "approvals" | "evidence";
  /** When true, the row shows the live extension install-status chip. */
  extensionStatus?: boolean;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    section: "Main",
    items: [
      { label: "Dashboard", icon: "ri-dashboard-3-line", to: "/dashboard" },
      { label: "Matches", icon: "ri-focus-3-line", badge: "5", to: "/dashboard/matches" },
      { label: "Search", icon: "ri-search-line", to: "/dashboard/search" },
      { label: "Applications", icon: "ri-send-plane-line", to: "/dashboard/applications" },
      { label: "Approvals", icon: "ri-shield-check-line", to: "/dashboard/approvals", badgeKey: "approvals" },
      { label: "Documents", icon: "ri-file-text-line", to: "/dashboard/documents", badgeKey: "evidence" },
      { label: "My Work Highlights", icon: "ri-sparkling-2-line", to: "/dashboard/experience" },
      { label: "Interviews (AI)", icon: "ri-mic-line", to: "/dashboard/interview" },
      { label: "Auto-apply", icon: "ri-flow-chart", to: "/dashboard/auto-apply" },
      { label: "Community", icon: "ri-question-answer-line", to: "/dashboard/questions" },
      { label: "Inbox", icon: "ri-inbox-line", to: "/dashboard/inbox" },
      { label: "Assistant", icon: "ri-magic-line", to: "/dashboard/assistant" },
    ],
  },
  {
    section: "Network",
    items: [
      { label: "Connections", icon: "ri-user-add-line", to: "/dashboard/network" },
      { label: "Messages", icon: "ri-chat-3-line", to: "/dashboard/messages" },
      { label: "Boards", icon: "ri-group-line", to: "/dashboard/boards" },
      { label: "Peer practice", icon: "ri-video-line", to: "/dashboard/practice" },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Get the extension", icon: "ri-puzzle-2-line", to: "/extension", extensionStatus: true },
      { label: "Tester program", icon: "ri-flask-line", to: "/dashboard/tester" },
      { label: "Security", icon: "ri-shield-check-line", to: "/dashboard/security" },
      { label: "Settings", icon: "ri-settings-3-line", to: "/dashboard/settings" },
    ],
  },
  {
    section: "Organize",
    items: [
      { label: "Profile", icon: "ri-id-card-line", to: "/dashboard/profile" },
      { label: "Job preferences", icon: "ri-equalizer-line", to: "/dashboard/preferences" },
      { label: "Reminders", icon: "ri-notification-3-line", to: "/dashboard/reminders" },
      { label: "Saved jobs", icon: "ri-bookmark-line", to: "/dashboard/saved" },
      { label: "Flagged jobs", icon: "ri-alert-line", to: "/dashboard/flagged" },
      { label: "Integrations", icon: "ri-plug-line", to: "/dashboard/integrations" },
    ],
  },
];

/** How long the rail waits after the pointer leaves before collapsing again. */
const COLLAPSE_DELAY_MS = 450;

interface SidebarContentProps {
  onNavigate?: () => void;
  /** True when the rail is showing full labels (pinned open, or hover-expanded). */
  expanded?: boolean;
  /** True when the rail is pinned to icon-only (labels reveal on hover). */
  collapsed?: boolean;
  /** Present only on desktop — shows the pin / collapse toggle. */
  onToggleCollapse?: () => void;
}

function SidebarContent({
  onNavigate,
  expanded = true,
  collapsed = false,
  onToggleCollapse,
}: SidebarContentProps) {
  const { user } = useCurrentUser();
  const brandName = useBrandName();
  const { pendingCount } = useApprovals();
  // Live install state, so the extension row mirrors the Topbar's status chip.
  const { installed, outdated } = useExtensionInstall();
  // Résumés with a stalled "My Work Highlights" wizard, so the indicator is
  // visible from every dashboard page, not just home and Documents. The badge is
  // a one-click jump into the stalled-longest wizard.
  const evidence = useEvidenceDraftStatus();
  const fullName = user?.full_name ?? "";
  const initials = fullName ? getInitials(fullName) : "";

  // Labels fade with the rail width instead of a CSS-only hover popout.
  const labelCls = expanded ? "opacity-100" : "opacity-0";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 pt-6 pb-5">
        <Link
          to="/"
          className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden cursor-pointer"
          aria-label={`${brandName} home`}
        >
          <img
            src="https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/1f022524-733b-4112-925c-668e802bb9e2_compressed_icon128.webp"
            alt={`${brandName} logo`}
            width={36}
            height={36}
            className="w-9 h-9 flex-shrink-0 rounded-lg object-cover"
          />
          <span
            className={`font-heading text-2xl font-semibold tracking-tight text-foreground-950 whitespace-nowrap transition-opacity duration-150 ${labelCls}`}
          >
            {brandName}
          </span>
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-pressed={!collapsed}
            aria-label={collapsed ? "Pin navigation open" : "Collapse navigation to icon rail"}
            title={collapsed ? "Pin navigation open" : "Collapse to icon rail"}
            className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-900 cursor-pointer transition-opacity duration-150 ${
              expanded ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <i className={collapsed ? "ri-pushpin-2-line" : "ri-pushpin-fill"}></i>
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 overflow-y-auto overflow-x-hidden">
        {NAV_SECTIONS.map((s) => (
          <div key={s.section} className="mb-5">
            <p
              className={`px-2 mb-2 text-[11px] uppercase tracking-widest text-foreground-400 font-semibold whitespace-nowrap transition-opacity duration-150 ${labelCls}`}
            >
              {s.section}
            </p>
            <div className="space-y-1">
              {s.items.map((item) => {
                const isEvidence = item.badgeKey === "evidence";
                // The badge only makes sense on the expanded rail; the jump link
                // sits on top of the row so it can target a different page.
                const showEvidenceBadge = isEvidence && evidence.count > 0 && expanded;
                const evidenceTooltip = evidence.oldestStep
                  ? `${evidence.count} in progress · one paused on ${evidence.oldestStep}`
                  : `${evidence.count} résumé${
                      evidence.count === 1 ? "" : "s"
                    } with a “My Work Highlights” wizard in progress`;
                return (
                  <div key={item.label} className="relative">
                    <NavLink
                      to={item.to}
                      end={item.to === "/dashboard"}
                      onClick={onNavigate}
                      title={collapsed && !expanded ? item.label : undefined}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        `relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap overflow-hidden ${
                          showEvidenceBadge ? "pr-10" : ""
                        } ${
                          isActive
                            ? "bg-primary-100 text-primary-900"
                            : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900"
                        }`
                      }
                    >
                      {({ isActive }) => {
                        const liveCount = item.badgeKey === "approvals" ? pendingCount : 0;
                        const badgeText =
                          item.badgeKey === "approvals"
                            ? liveCount > 0
                              ? String(liveCount)
                              : undefined
                            : item.badge;
                        return (
                          <>
                            {isActive && (
                              <span
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary-500"
                                aria-hidden="true"
                              ></span>
                            )}
                            <span
                              className={`relative w-5 h-5 flex-shrink-0 flex items-center justify-center ${
                                isActive ? "text-primary-700" : ""
                              }`}
                            >
                              <i className={item.icon}></i>
                              {item.extensionStatus && !expanded && outdated && (
                                <span
                                  title="A newer version of the extension is available — open the page to update."
                                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent-500 ring-2 ring-background-50"
                                ></span>
                              )}
                            </span>
                            <span
                              className={`flex-1 truncate transition-opacity duration-150 ${labelCls}`}
                            >
                              {item.label}
                            </span>
                            {item.extensionStatus && expanded ? (
                              installed ? (
                                <span
                                  title={
                                    outdated
                                      ? "A newer version of the extension is available. Open the page to grab the update — your connected sites stay as they are."
                                      : "You already have the extension on this browser. Open the page to manage it or review the setup steps."
                                  }
                                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap cursor-help"
                                >
                                  <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-secondary-500"></span>
                                  {outdated ? "Update" : "Installed"}
                                </span>
                              ) : (
                                <span
                                  title="You don't have the extension yet. Open the page to add it and connect job sites in one click."
                                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background-100 text-foreground-500 whitespace-nowrap cursor-help"
                                >
                                  <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-foreground-300"></span>
                                  Not installed
                                </span>
                              )
                            ) : null}
                            {badgeText ? (
                              <span
                                className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap transition-opacity duration-150 bg-primary-500 text-background-50 ${labelCls}`}
                              >
                                {badgeText}
                              </span>
                            ) : null}
                          </>
                        );
                      }}
                    </NavLink>
                    {showEvidenceBadge && (
                      <Link
                        to={evidence.oldestHref ?? "/dashboard/documents"}
                        onClick={onNavigate}
                        title={evidenceTooltip}
                        aria-label={evidenceTooltip}
                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer"
                      >
                        {evidence.count}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-background-200">
        {expanded ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-background-100 border border-background-200">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-background-50 font-semibold ring-2 ring-primary-200/60">
              {initials || <i className="ri-user-line text-base"></i>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground-950 truncate">
                {fullName}
              </div>
              <div className="text-xs text-foreground-500 truncate">
                {userProfile.plan} plan · {userProfile.profileStrength}%
              </div>
            </div>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 cursor-pointer"
              aria-label="Profile settings"
            >
              <i className="ri-more-2-fill"></i>
            </button>
          </div>
        ) : (
          <div className="flex justify-center" title={fullName}>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-background-50 font-semibold">
              {initials || <i className="ri-user-line text-base"></i>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  mobileOpen,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Hover is a temporary expansion on top of the pinned preference.
  const [hovered, setHovered] = useState(false);
  const collapseTimer = useRef<number | null>(null);

  const clearTimer = () => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  };

  // Hover only matters while the rail is pinned to icons.
  const expanded = !collapsed || hovered;

  // Drop any pending timer when the pinned state changes or on unmount.
  useEffect(() => {
    if (!collapsed) {
      clearTimer();
      setHovered(false);
    }
  }, [collapsed]);

  useEffect(() => () => clearTimer(), []);

  function handleEnter() {
    if (!collapsed) return;
    clearTimer();
    setHovered(true);
  }

  function handleLeave() {
    if (!collapsed) return;
    clearTimer();
    // Give the pointer a moment to settle back in before collapsing.
    collapseTimer.current = window.setTimeout(() => {
      collapseTimer.current = null;
      setHovered(false);
    }, COLLAPSE_DELAY_MS);
  }

  return (
    <>
      <aside
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        aria-label="Primary navigation"
        className={`hidden lg:flex fixed inset-y-0 left-0 bg-background-50 border-r border-background-200 z-40 flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          expanded ? "w-64" : "w-16"
        }`}
      >
        <SidebarContent
          expanded={expanded}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
          <div className="absolute inset-y-0 left-0 w-72 bg-background-50 border-r border-background-200 animate-fade-in-up">
            <button
              onClick={onClose}
              className="absolute top-5 right-4 w-9 h-9 flex items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer"
              aria-label="Close menu"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
            <SidebarContent expanded onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}