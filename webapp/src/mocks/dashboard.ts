export interface UserProfile {
  name: string;
  role: string;
  location: string;
  plan: string;
  initials: string;
  profileStrength: number;
  goal: number;
  goalDone: number;
}

export const userProfile: UserProfile = {
  name: "Jordan Reyes",
  role: "Product Designer",
  location: "San Francisco, CA",
  plan: "Focused",
  initials: "JR",
  profileStrength: 82,
  goal: 30,
  goalDone: 18,
};

export interface Stat {
  id: number;
  label: string;
  value: number;
  delta: string;
  icon: string;
  tone: "primary" | "accent" | "secondary" | "foreground";
  spark: number[];
}

export const stats: Stat[] = [
  { id: 1, label: "Applications sent", value: 128, delta: "+18 this week", icon: "ri-send-plane-line", tone: "primary", spark: [4, 6, 5, 8, 7, 10, 12, 9, 14, 13, 16, 18] },
  { id: 2, label: "Replies received", value: 37, delta: "+6 this week", icon: "ri-mail-line", tone: "accent", spark: [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8] },
  { id: 3, label: "Interviews", value: 9, delta: "3 upcoming", icon: "ri-calendar-line", tone: "secondary", spark: [1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4] },
  { id: 4, label: "Offers", value: 2, delta: "+1 this week", icon: "ri-trophy-line", tone: "foreground", spark: [0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 2] },
];

export interface JobMatch {
  id: number;
  title: string;
  company: string;
  companyInitial: string;
  location: string;
  salary: string;
  type: string;
  fitScore: number;
  tags: string[];
  source: string;
  posted: string;
}

export const jobMatches: JobMatch[] = [
  { id: 1, title: "Senior Product Designer", company: "Figma", companyInitial: "F", location: "San Francisco · Remote", salary: "$160k–$195k", type: "Full-time", fitScore: 94, tags: ["Design systems", "Prototyping", "Figma"], source: "LinkedIn", posted: "2h ago" },
  { id: 2, title: "Staff Product Designer", company: "Linear", companyInitial: "L", location: "Remote · US", salary: "$180k–$220k", type: "Full-time", fitScore: 91, tags: ["B2B SaaS", "0→1", "Interaction"], source: "Greenhouse", posted: "5h ago" },
  { id: 3, title: "Design Lead, Payments", company: "Ramp", companyInitial: "R", location: "New York · Hybrid", salary: "$190k–$230k", type: "Full-time", fitScore: 88, tags: ["Fintech", "Leadership", "Data viz"], source: "Indeed", posted: "1d ago" },
  { id: 4, title: "Product Designer, Growth", company: "Notion", companyInitial: "N", location: "San Francisco", salary: "$150k–$185k", type: "Full-time", fitScore: 86, tags: ["Growth", "A/B testing", "Onboarding"], source: "LinkedIn", posted: "1d ago" },
  { id: 5, title: "Senior UX Designer", company: "Airbnb", companyInitial: "A", location: "Remote · Global", salary: "$165k–$205k", type: "Full-time", fitScore: 83, tags: ["Design systems", "Research", "Accessibility"], source: "Greenhouse", posted: "2d ago" },
  { id: 6, title: "Senior Product Designer", company: "Retool", companyInitial: "R", location: "Remote · US", salary: "$165k–$200k", type: "Full-time", fitScore: 82, tags: ["Internal tools", "B2B", "Systems"], source: "Greenhouse", posted: "3d ago" },
  { id: 7, title: "UX Engineer", company: "Vercel", companyInitial: "V", location: "Remote · Global", salary: "$150k–$190k", type: "Full-time", fitScore: 80, tags: ["React", "Design systems", "Frontend"], source: "LinkedIn", posted: "3d ago" },
  { id: 8, title: "Product Designer (Contract)", company: "Spotify", companyInitial: "S", location: "Remote · Europe", salary: "$90/hr", type: "Contract", fitScore: 77, tags: ["Music", "Growth", "Mobile"], source: "Indeed", posted: "4d ago" },
  { id: 9, title: "Senior Brand Designer", company: "Stripe", companyInitial: "S", location: "Remote · US", salary: "$150k–$185k", type: "Full-time", fitScore: 75, tags: ["Brand", "Marketing", "Visual"], source: "Greenhouse", posted: "5d ago" },
];

export interface PipelineCard {
  id: number;
  role: string;
  company: string;
  companyInitial: string;
  detail: string;
  time: string;
}

export interface PipelineColumn {
  id: string;
  title: string;
  count: number;
  tone: "background" | "primary" | "accent" | "secondary";
  cards: PipelineCard[];
}

export const pipelineColumns: PipelineColumn[] = [
  {
    id: "saved",
    title: "Saved",
    count: 24,
    tone: "background",
    cards: [
      { id: 1, role: "Product Designer, AI", company: "Anthropic", companyInitial: "A", detail: "Saved · review match", time: "2d ago" },
      { id: 2, role: "Design Engineer", company: "Vercel", companyInitial: "V", detail: "Saved · high fit", time: "4d ago" },
      { id: 3, role: "Brand Designer", company: "Linear", companyInitial: "L", detail: "Saved · new posting", time: "5d ago" },
    ],
  },
  {
    id: "applied",
    title: "Applied",
    count: 12,
    tone: "primary",
    cards: [
      { id: 4, role: "Senior UX Engineer", company: "Airbnb", companyInitial: "A", detail: "Applied · awaiting reply", time: "2d ago" },
      { id: 5, role: "Product Designer, Growth", company: "Notion", companyInitial: "N", detail: "Applied · auto-submit", time: "4d ago" },
      { id: 6, role: "Senior Product Designer", company: "Figma", companyInitial: "F", detail: "Applied · cover letter sent", time: "5d ago" },
    ],
  },
  {
    id: "interviewing",
    title: "Interviewing",
    count: 4,
    tone: "accent",
    cards: [
      { id: 7, role: "Product Designer II", company: "Notion", companyInitial: "N", detail: "Interview 2/3 · tomorrow", time: "10:00 AM" },
      { id: 8, role: "Design Lead, Payments", company: "Ramp", companyInitial: "R", detail: "Case study · Fri", time: "1:30 PM" },
      { id: 9, role: "Staff Product Designer", company: "Linear", companyInitial: "L", detail: "Hiring manager · next week", time: "TBD" },
    ],
  },
  {
    id: "offer",
    title: "Offer",
    count: 1,
    tone: "secondary",
    cards: [
      { id: 10, role: "Design Lead", company: "Ramp", companyInitial: "R", detail: "Offer received · $220k", time: "1d ago" },
      { id: 11, role: "Senior Product Designer", company: "Figma", companyInitial: "F", detail: "Final round · pending", time: "This week" },
    ],
  },
];

export interface Activity {
  id: number;
  icon: string;
  tone: "primary" | "accent" | "secondary" | "foreground";
  title: string;
  meta: string;
  time: string;
}

export const activities: Activity[] = [
  { id: 1, icon: "ri-send-plane-line", tone: "primary", title: "Application submitted", meta: "Senior Product Designer · Figma", time: "12m ago" },
  { id: 2, icon: "ri-mail-line", tone: "accent", title: "New reply from recruiter", meta: "Ramp · Design Lead, Payments", time: "1h ago" },
  { id: 3, icon: "ri-calendar-check-line", tone: "secondary", title: "Interview scheduled", meta: "Notion · Round 2 with hiring manager", time: "3h ago" },
  { id: 4, icon: "ri-shield-check-line", tone: "primary", title: "Verified 6 new postings", meta: "0 flagged as potential scams", time: "5h ago" },
  { id: 5, icon: "ri-mic-line", tone: "accent", title: "Mock interview completed", meta: "Behavioral · score 82/100", time: "Yesterday" },
];

export interface SavedJob {
  id: number;
  title: string;
  company: string;
  companyInitial: string;
  location: string;
  salary: string;
  saved: string;
  tags: string[];
}

export const savedJobs: SavedJob[] = [
  { id: 1, title: "Product Designer, AI", company: "Anthropic", companyInitial: "A", location: "San Francisco", salary: "$170k–$210k", saved: "2d ago", tags: ["AI", "Product design", "0→1"] },
  { id: 2, title: "Design Engineer", company: "Vercel", companyInitial: "V", location: "Remote", salary: "$160k–$200k", saved: "4d ago", tags: ["Frontend", "Design systems"] },
  { id: 3, title: "Senior Product Designer", company: "Stripe", companyInitial: "S", location: "Remote · US", salary: "$175k–$215k", saved: "5d ago", tags: ["Fintech", "Payments"] },
  { id: 4, title: "UX Researcher", company: "Figma", companyInitial: "F", location: "San Francisco · Hybrid", salary: "$150k–$185k", saved: "1w ago", tags: ["Research", "Design systems"] },
  { id: 5, title: "Brand Designer", company: "Linear", companyInitial: "L", location: "Remote · Global", salary: "$140k–$170k", saved: "1w ago", tags: ["Brand", "Marketing"] },
  { id: 6, title: "Product Designer, Growth", company: "Notion", companyInitial: "N", location: "San Francisco", salary: "$150k–$185k", saved: "2w ago", tags: ["Growth", "A/B testing"] },
];

export interface Interviewer {
  id: number;
  name: string;
  role: string;
  style: string;
  initial: string;
  tone: "primary" | "accent" | "secondary";
}

export const interviewers: Interviewer[] = [
  { id: 1, name: "Ava Chen", role: "Design Director · Figma", style: "Behavioral", initial: "A", tone: "accent" },
  { id: 2, name: "Marcus Reed", role: "Staff Engineer · Linear", style: "Technical", initial: "M", tone: "primary" },
  { id: 3, name: "Priya Nair", role: "Recruiting Lead · Ramp", style: "Case study", initial: "P", tone: "secondary" },
];

export const interviewQuestions: string[] = [
  "Tell me about yourself and your journey into product design.",
  "Walk me through a project where you resolved conflicting stakeholder feedback.",
  "Describe a time you used data to change a product decision.",
  "How do you approach designing for accessibility?",
  "Tell me about a project that failed. What did you learn?",
  "Why do you want to join our team?",
];

export interface Notification {
  id: number;
  icon: string;
  tone: "primary" | "accent" | "secondary";
  text: string;
  time: string;
  unread: boolean;
}

export const notifications: Notification[] = [
  { id: 1, icon: "ri-mail-line", tone: "accent", text: "Ramp sent you a reply", time: "12m ago", unread: true },
  { id: 2, icon: "ri-calendar-check-line", tone: "primary", text: "Interview confirmed for tomorrow", time: "1h ago", unread: true },
  { id: 3, icon: "ri-shield-check-line", tone: "secondary", text: "Weekly scam report is ready", time: "1d ago", unread: false },
];