// Sample dashboard summary used to preview the overview page (including the
// "top match" card) without a live backend. Matches the DashboardSummary shape
// consumed by the dashboard layout and overview page.

export const previewDashboardSummary = {
  matches: {
    total: 12,
    strong: 5,
    top: {
      job_id: 1,
      title: "Senior Product Designer",
      company: "Figma",
      score: 94,
      salary_display: "$160k–$195k",
      source_display: "LinkedIn",
      source_platform: "linkedin",
    },
  },
  applications: {
    total: 18,
    submitted: 12,
    interviewing: 4,
    offered: 2,
  },
  interviews: 3,
  weekly_goal: {
    target: 30,
    done: 18,
    applications_this_week: 6,
    interviews_this_week: 2,
  },
  resumes: 2,
  cover_letters: 3,
  highlights: 8,
  saved_jobs: 6,
  saved_searches: 3,
  connected_apps: {
    count: 3,
    providers: ["linkedin", "greenhouse", "indeed"],
  },
  unread_notifications: 4,
  profile_complete: true,
  recent_activity: [
    {
      type: "application",
      message: "Application submitted to Figma",
      at: "2026-09-08T10:00:00Z",
      read: false,
    },
    {
      type: "reply",
      message: "New reply from Ramp · Design Lead, Payments",
      at: "2026-09-08T08:00:00Z",
      read: false,
    },
    {
      type: "interview",
      message: "Interview scheduled with Notion",
      at: "2026-09-07T15:00:00Z",
      read: false,
    },
    {
      type: "verification",
      message: "Verified 6 new postings",
      at: "2026-09-07T11:30:00Z",
      read: true,
    },
  ],
};