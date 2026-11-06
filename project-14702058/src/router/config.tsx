import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/home/page";
import ExtensionLanding from "@/pages/extension/page";
import Privacy from "@/pages/privacy/page";
import Terms from "@/pages/terms/page";
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import Overview from "@/pages/dashboard/page";
import Matches from "@/pages/dashboard/matches/page";
import Search from "@/pages/dashboard/search/page";
import JobDetail from "@/pages/dashboard/job/page";
import Flagged from "@/pages/dashboard/flagged/page";
import Applications from "@/pages/dashboard/applications/page";
import Saved from "@/pages/dashboard/saved/page";
import Interview from "@/pages/dashboard/interview/page";
import Integrations from "@/pages/dashboard/integrations/page";
import Settings from "@/pages/dashboard/settings/page";
import Profile from "@/pages/dashboard/profile/page";
import Preferences from "@/pages/dashboard/preferences/page";
import Documents from "@/pages/dashboard/documents/page";
import ResumeDetail from "@/pages/dashboard/documents/resume-detail/page";
import ResumeTemplates from "@/pages/dashboard/documents/resume-templates/page";
import CoverLetterDetail from "@/pages/dashboard/documents/cover-letter-detail/page";
import CoverLetterTemplates from "@/pages/dashboard/documents/cover-letter-templates/page";
import WorkHighlights from "@/pages/dashboard/experience/page";
import Questions from "@/pages/dashboard/questions/page";
import Assistant from "@/pages/dashboard/assistant/page";
import AutoApply from "@/pages/dashboard/autoapply/page";
import Approvals from "@/pages/dashboard/approvals/page";
import Reminders from "@/pages/dashboard/reminders/page";
import Network from "@/pages/dashboard/network/page";
import Messages from "@/pages/dashboard/messages/page";
import Boards from "@/pages/dashboard/boards/page";
import Practice from "@/pages/dashboard/practice/page";
import Inbox from "@/pages/dashboard/inbox/page";
import Security from "@/pages/dashboard/security/page";
import TesterProgram from "@/pages/dashboard/tester/page";
import Login from "@/pages/auth/login/page";
import Register from "@/pages/auth/register/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/extension",
    element: <ExtensionLanding />,
  },
  {
    path: "/privacy",
    element: <Privacy />,
  },
  {
    path: "/terms",
    element: <Terms />,
  },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: "search", element: <Search /> },
      { path: "matches", element: <Matches /> },
      { path: "jobs/:id", element: <JobDetail /> },
      { path: "flagged", element: <Flagged /> },
      { path: "applications", element: <Applications /> },
      { path: "saved", element: <Saved /> },
      { path: "interview", element: <Interview /> },
      { path: "integrations", element: <Integrations /> },
      { path: "settings", element: <Settings /> },
      { path: "profile", element: <Profile /> },
      { path: "preferences", element: <Preferences /> },
      { path: "documents", element: <Documents /> },
      { path: "documents/resumes/:id", element: <ResumeDetail /> },
      { path: "documents/resumes/:id/templates", element: <ResumeTemplates /> },
      { path: "documents/cover-letters/:id", element: <CoverLetterDetail /> },
      { path: "documents/cover-letters/:id/templates", element: <CoverLetterTemplates /> },
      { path: "experience", element: <WorkHighlights /> },
      { path: "questions", element: <Questions /> },
      { path: "assistant", element: <Assistant /> },
      { path: "auto-apply", element: <AutoApply /> },
      { path: "approvals", element: <Approvals /> },
      { path: "reminders", element: <Reminders /> },
      { path: "network", element: <Network /> },
      { path: "messages", element: <Messages /> },
      { path: "boards", element: <Boards /> },
      { path: "practice", element: <Practice /> },
      { path: "inbox", element: <Inbox /> },
      { path: "security", element: <Security /> },
      { path: "tester", element: <TesterProgram /> },
    ],
  },
  {
    path: "/auth/login",
    element: <Login />,
  },
  {
    path: "/auth/register",
    element: <Register />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;