import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/home/page";
import Auth from "@/pages/auth/page";
import RequireAuth from "@/lib/RequireAuth";
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import Overview from "@/pages/dashboard/page";
import Matches from "@/pages/dashboard/matches/page";
import Applications from "@/pages/dashboard/applications/page";
import Saved from "@/pages/dashboard/saved/page";
import Interview from "@/pages/dashboard/interview/page";
import Integrations from "@/pages/dashboard/integrations/page";
import Settings from "@/pages/dashboard/settings/page";
import Security from "@/pages/dashboard/security/page";
import ScamWatch from "@/pages/dashboard/scam-watch/page";
import Inbox from "@/pages/dashboard/inbox/page";
import Messages from "@/pages/dashboard/messages/page";
import Boards from "@/pages/dashboard/boards/page";
import Assistant from "@/pages/dashboard/assistant/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/auth",
    element: <Auth />,
  },
  {
    path: "/dashboard",
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Overview /> },
      { path: "matches", element: <Matches /> },
      { path: "applications", element: <Applications /> },
      { path: "saved", element: <Saved /> },
      { path: "inbox", element: <Inbox /> },
      { path: "messages", element: <Messages /> },
      { path: "boards", element: <Boards /> },
      { path: "assistant", element: <Assistant /> },
      { path: "scam-watch", element: <ScamWatch /> },
      { path: "interview", element: <Interview /> },
      { path: "integrations", element: <Integrations /> },
      { path: "security", element: <Security /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;