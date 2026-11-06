import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/pages/dashboard/components/Sidebar";
import Topbar from "@/pages/dashboard/components/Topbar";
import OnboardingProvider from "@/pages/dashboard/onboarding/OnboardingProvider";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { readNavRailCollapsed, writeNavRailCollapsed } from "@/lib/navRailMemory";
import { refreshApprovals } from "@/hooks/useApprovalsStore";
import { useApprovalsPoll } from "@/hooks/useApprovalsPoll";
import { useExtensionAnnounceToast } from "@/hooks/useExtensionAnnounceToast";
import { useExtensionPromoToast } from "@/hooks/useExtensionPromoToast";
import { useExtensionUpdateToast } from "@/hooks/useExtensionUpdateToast";

export interface DashboardOutletContext {
  searchQuery: string;
  summary: DashboardSummary | null;
  summaryLoading: boolean;
}

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Left nav starts as an icon-only rail; the choice is remembered across visits.
  const [railCollapsed, setRailCollapsed] = useState(() => readNavRailCollapsed());
  const [searchQuery, setSearchQuery] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Poll the pending-approvals count once per dashboard load so the nav badge
  // and the home banner stay current...
  useEffect(() => {
    refreshApprovals();
  }, []);

  // One-time confirmation the first moment the Connect extension announces itself.
  useExtensionAnnounceToast();

  // One-time nudge for signed-in users pointing them at the extension landing page.
  useExtensionPromoToast();

  // One-time nudge for installed users whose extension is behind the latest build.
  useExtensionUpdateToast();

  // ...then keep it quietly in sync in the background so newly parked
  // applications appear without a manual reload.
  useApprovalsPoll();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getDashboardSummary();
        if (active) setSummary(data ?? null);
      } catch {
        if (active) setSummary(null);
      } finally {
        if (active) setSummaryLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleRail() {
    setRailCollapsed((value) => {
      writeNavRailCollapsed(!value);
      return !value;
    });
  }

  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-background-50 text-foreground-950 font-sans">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          collapsed={railCollapsed}
          onToggleCollapse={toggleRail}
        />

        <div className={railCollapsed ? "lg:pl-16" : "lg:pl-64"}>
          <Topbar
            onMenuClick={() => setMobileNavOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            connectedProviders={summary?.connected_apps?.providers ?? []}
            unreadNotifications={summary?.unread_notifications ?? 0}
          />

          <main className="px-4 md:px-6 lg:px-8 py-6 md:py-8 max-w-[1440px] mx-auto">
            <Outlet context={{ searchQuery, summary, summaryLoading }} />
          </main>
        </div>
      </div>
    </OnboardingProvider>
  );
}