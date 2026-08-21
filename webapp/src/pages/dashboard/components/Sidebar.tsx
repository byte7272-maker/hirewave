import { Link, NavLink } from "react-router-dom";
import { initials, useAuth } from "@/lib/auth";

interface NavItem {
  label: string;
  icon: string;
  to: string;
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
      { label: "Job matches", icon: "ri-focus-3-line", to: "/dashboard/matches" },
      { label: "Applications", icon: "ri-send-plane-line", to: "/dashboard/applications" },
      { label: "Inbox", icon: "ri-mail-line", to: "/dashboard/inbox" },
      { label: "Messages", icon: "ri-chat-3-line", to: "/dashboard/messages" },
      { label: "Boards", icon: "ri-group-line", to: "/dashboard/boards" },
      { label: "Assistant", icon: "ri-magic-line", to: "/dashboard/assistant" },
      { label: "Interview prep", icon: "ri-mic-line", to: "/dashboard/interview" },
    ],
  },
  {
    section: "Organize",
    items: [
      { label: "Saved jobs", icon: "ri-bookmark-line", to: "/dashboard/saved" },
      { label: "Scam watch", icon: "ri-alarm-warning-line", to: "/dashboard/scam-watch" },
      { label: "Integrations", icon: "ri-plug-line", to: "/dashboard/integrations" },
      { label: "Security", icon: "ri-shield-check-line", to: "/dashboard/security" },
      { label: "Settings", icon: "ri-settings-3-line", to: "/dashboard/settings" },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.email || "Account";
  return (
    <div className="flex flex-col h-full">
      <Link to="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5 cursor-pointer">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-500 text-background-50">
          <i className="ri-radar-line text-xl"></i>
        </div>
        <span className="font-heading text-2xl font-semibold tracking-tight text-foreground-950">Hirewave</span>
      </Link>

      <nav className="flex-1 px-3 overflow-y-auto">
        {NAV_SECTIONS.map((s) => (
          <div key={s.section} className="mb-5">
            <p className="px-2 mb-2 text-[11px] uppercase tracking-widest text-foreground-400 font-semibold">
              {s.section}
            </p>
            <div className="space-y-1">
              {s.items.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === "/dashboard"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-primary-100 text-primary-900"
                        : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`w-5 h-5 flex items-center justify-center ${isActive ? "text-primary-700" : ""}`}>
                        <i className={item.icon}></i>
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-background-200">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-background-100 border border-background-200">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-background-50 font-semibold">
            {initials(user?.full_name ?? "", user?.email ?? "U")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground-950 truncate">{name}</div>
            <div className="text-xs text-foreground-500 truncate">{user?.email}</div>
          </div>
          <Link
            to="/"
            onClick={() => logout()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 cursor-pointer"
            aria-label="Sign out"
            title="Sign out"
          >
            <i className="ri-logout-box-r-line"></i>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-background-50 border-r border-background-200 z-40 flex-col">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground-950/40" onClick={onClose}></div>
          <div className="absolute inset-y-0 left-0 w-72 bg-background-50 border-r border-background-200 animate-fade-in-up">
            <button
              onClick={onClose}
              className="absolute top-5 right-4 w-9 h-9 flex items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 cursor-pointer"
              aria-label="Close menu"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
            <SidebarContent onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
