import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/pages/dashboard/components/Sidebar";
import Topbar from "@/pages/dashboard/components/Topbar";
import SessionReviewModal from "@/pages/dashboard/components/SessionReviewModal";

export interface DashboardOutletContext {
  searchQuery: string;
}

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background-50 text-foreground-950 font-sans">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="lg:pl-64">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="px-4 md:px-6 lg:px-8 py-6 md:py-8 max-w-[1440px] mx-auto">
          <Outlet context={{ searchQuery }} />
        </main>
      </div>

      <SessionReviewModal />
    </div>
  );
}