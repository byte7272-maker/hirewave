// Sample job data used to preview cross-posting detection without a live backend.
// Each entry carries likely_duplicate / consolidated_count signals so the
// CrossPostingBadge ("Likely the same job" / "Seen on N boards") renders.

interface CrossPosting {
  id?: string | number;
  job_posting_id?: string | number;
  source_platform?: string;
  source?: string;
  url?: string;
  title?: string;
  company?: string;
}

interface MockJobMatch {
  job_id: number;
  title: string;
  company: string;
  company_logo?: string;
  score: number;
  matching_skills: string[];
  gap_skills: string[];
  authenticity_score?: number;
  category?: string;
  url?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

interface MockSavedJob {
  id: number;
  title: string;
  company: string;
  location?: string;
  type?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  category?: string;
  created_at?: string;
  quality_grade?: string;
  quality_score?: number;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

interface MockJob {
  id: number;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  type?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
  description?: string;
  posted_at?: string;
  created_at?: string;
  authenticity_score?: number;
  quality_grade?: string;
  quality_score?: number;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

interface MockApplicationJob {
  company?: string;
  title?: string;
  url?: string;
  source_display?: string;
  source_platform?: string;
  likely_duplicate?: boolean;
  duplicate_group_id?: string | number;
  cross_posting_ids?: Array<string | number>;
  cross_postings?: CrossPosting[];
  consolidated_count?: number;
  consolidated_sources?: string[];
}

interface MockApplication {
  id: number;
  job_id?: number;
  title: string;
  company: string;
  status: "draft" | "submitted" | "interviewing" | "offer";
  location?: string;
  salary_display?: string;
  created_at?: string;
  updated_at?: string;
  job?: MockApplicationJob | null;
}

export const mockMatches: MockJobMatch[] = [
  {
    job_id: 1,
    title: "Senior Product Designer",
    company: "Figma",
    score: 94,
    matching_skills: ["Design systems", "Prototyping", "Figma"],
    gap_skills: [],
    authenticity_score: 91,
    category: "Design systems",
    url: "https://www.linkedin.com/jobs/figma-senior-product-designer",
    salary_display: "$160k–$195k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
  },
  {
    job_id: 2,
    title: "Staff Product Designer",
    company: "Linear",
    score: 91,
    matching_skills: ["B2B SaaS", "0→1", "Interaction"],
    gap_skills: ["Motion design"],
    authenticity_score: 88,
    category: "B2B SaaS",
    salary_display: "$180k–$220k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    consolidated_count: 3,
    consolidated_sources: ["LinkedIn", "Greenhouse", "Indeed"],
  },
  {
    job_id: 3,
    title: "Design Lead, Payments",
    company: "Ramp",
    score: 88,
    matching_skills: ["Fintech", "Leadership", "Data viz"],
    gap_skills: ["Regulatory compliance"],
    authenticity_score: 84,
    category: "Fintech",
    salary_display: "$190k–$230k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    likely_duplicate: true,
    duplicate_group_id: "grp-ramp-payments",
    cross_posting_ids: [301, 302, 303],
    cross_postings: [
      { id: 301, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/ramp-design-lead-payments" },
      { id: 302, source_platform: "Indeed", url: "https://www.indeed.com/job/ramp-design-lead-payments" },
      { id: 303, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/ramp/jobs/design-lead-payments" },
    ],
  },
  {
    job_id: 4,
    title: "Product Designer, Growth",
    company: "Notion",
    score: 86,
    matching_skills: ["Growth", "A/B testing", "Onboarding"],
    gap_skills: ["SQL"],
    authenticity_score: 86,
    category: "Growth",
    salary_display: "$150k–$185k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
  },
  {
    job_id: 5,
    title: "Senior UX Designer",
    company: "Airbnb",
    score: 83,
    matching_skills: ["Design systems", "Research", "Accessibility"],
    gap_skills: [],
    authenticity_score: 90,
    category: "Research",
    salary_display: "$165k–$205k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    likely_duplicate: true,
    duplicate_group_id: "grp-airbnb-ux",
    cross_posting_ids: [501, 502],
    cross_postings: [
      { id: 501, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/airbnb/jobs/senior-ux-designer" },
      { id: 502, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/airbnb-senior-ux-designer" },
    ],
  },
  {
    job_id: 6,
    title: "Senior Product Designer",
    company: "Retool",
    score: 82,
    matching_skills: ["Internal tools", "B2B", "Systems"],
    gap_skills: ["Data modeling"],
    authenticity_score: 81,
    category: "Internal tools",
    salary_display: "$165k–$200k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    consolidated_count: 2,
    consolidated_sources: ["Greenhouse", "Indeed"],
  },
  {
    job_id: 7,
    title: "UX Engineer",
    company: "Vercel",
    score: 80,
    matching_skills: ["React", "Design systems", "Frontend"],
    gap_skills: ["TypeScript"],
    authenticity_score: 87,
    category: "Design systems",
    salary_display: "$150k–$190k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
  },
  {
    job_id: 8,
    title: "Product Designer (Contract)",
    company: "Spotify",
    score: 77,
    matching_skills: ["Music", "Growth", "Mobile"],
    gap_skills: ["Android"],
    authenticity_score: 79,
    category: "Growth",
    salary_display: "$90/hr",
    source_display: "Indeed",
    source_platform: "indeed",
  },
];

export const mockSavedJobs: MockSavedJob[] = [
  {
    id: 101,
    title: "Product Designer, AI",
    company: "Anthropic",
    location: "San Francisco",
    type: "Full-time",
    salary_display: "$170k–$210k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    category: "AI",
    created_at: "2026-09-06T14:00:00Z",
    quality_grade: "A",
    quality_score: 92,
    consolidated_count: 2,
    consolidated_sources: ["LinkedIn", "Greenhouse"],
  },
  {
    id: 102,
    title: "Design Engineer",
    company: "Vercel",
    location: "Remote",
    type: "Full-time",
    salary_display: "$160k–$200k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    category: "Frontend",
    created_at: "2026-09-04T09:30:00Z",
    quality_grade: "B",
    quality_score: 84,
    likely_duplicate: true,
    duplicate_group_id: "grp-vercel-design-engineer",
    cross_posting_ids: [201, 202],
    cross_postings: [
      { id: 201, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/vercel/jobs/design-engineer" },
      { id: 202, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/vercel-design-engineer" },
    ],
  },
  {
    id: 103,
    title: "Senior Product Designer",
    company: "Stripe",
    location: "Remote · US",
    type: "Full-time",
    salary_display: "$175k–$215k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    category: "Fintech",
    created_at: "2026-09-03T16:45:00Z",
    quality_grade: "A",
    quality_score: 90,
  },
  {
    id: 104,
    title: "UX Researcher",
    company: "Figma",
    location: "San Francisco · Hybrid",
    type: "Full-time",
    salary_display: "$150k–$185k",
    source_display: "Indeed",
    source_platform: "indeed",
    category: "Research",
    created_at: "2026-09-01T11:20:00Z",
    quality_grade: "B",
    quality_score: 81,
    consolidated_count: 3,
    consolidated_sources: ["LinkedIn", "Indeed", "Glassdoor"],
  },
  {
    id: 105,
    title: "Brand Designer",
    company: "Linear",
    location: "Remote · Global",
    type: "Full-time",
    salary_display: "$140k–$170k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    category: "Brand",
    created_at: "2026-08-28T10:00:00Z",
    quality_grade: "C",
    quality_score: 74,
  },
];

export const mockJobs: MockJob[] = [
  {
    id: 1,
    title: "Senior Product Designer",
    company: "Figma",
    location: "San Francisco · Remote",
    remote: true,
    type: "Full-time",
    salary_display: "$160k–$195k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/figma-senior-product-designer",
    description:
      "Figma is looking for a Senior Product Designer to shape the future of collaborative design tooling. You'll own end-to-end design for core editor surfaces and partner closely with engineering and research.\n\nYou'll drive design systems work, prototype complex interactions, and raise the quality bar across the product.",
    posted_at: "2026-09-08T12:00:00Z",
    authenticity_score: 91,
    quality_grade: "A",
    quality_score: 94,
  },
  {
    id: 2,
    title: "Staff Product Designer",
    company: "Linear",
    location: "Remote · US",
    remote: true,
    type: "Full-time",
    salary_display: "$180k–$220k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://boards.greenhouse.io/linear/jobs/staff-product-designer",
    description:
      "Linear is hiring a Staff Product Designer to help us build the fastest, most delightful issue tracking experience. You'll lead large, ambiguous product areas and mentor a growing design team.",
    posted_at: "2026-09-08T09:00:00Z",
    authenticity_score: 88,
    quality_grade: "A",
    quality_score: 91,
    consolidated_count: 3,
    consolidated_sources: ["LinkedIn", "Greenhouse", "Indeed"],
  },
  {
    id: 3,
    title: "Design Lead, Payments",
    company: "Ramp",
    location: "New York · Hybrid",
    remote: false,
    type: "Full-time",
    salary_display: "$190k–$230k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/ramp-design-lead-payments",
    description:
      "Ramp is seeking a Design Lead to own the payments experience. You'll manage a small team, set design direction, and partner with product and engineering to ship fintech workflows.",
    posted_at: "2026-09-07T18:30:00Z",
    authenticity_score: 84,
    quality_grade: "B",
    quality_score: 88,
    likely_duplicate: true,
    duplicate_group_id: "grp-ramp-payments",
    cross_posting_ids: [301, 302, 303],
    cross_postings: [
      { id: 301, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/ramp-design-lead-payments" },
      { id: 302, source_platform: "Indeed", url: "https://www.indeed.com/job/ramp-design-lead-payments" },
      { id: 303, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/ramp/jobs/design-lead-payments" },
    ],
  },
  {
    id: 4,
    title: "Product Designer, Growth",
    company: "Notion",
    location: "San Francisco",
    remote: false,
    type: "Full-time",
    salary_display: "$150k–$185k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/notion-product-designer-growth",
    description:
      "Notion is growing its Growth design team. You'll run experiments across activation, onboarding, and retention, using data to inform every decision.",
    posted_at: "2026-09-07T15:00:00Z",
    authenticity_score: 86,
    quality_grade: "B",
    quality_score: 86,
  },
  {
    id: 5,
    title: "Senior UX Designer",
    company: "Airbnb",
    location: "Remote · Global",
    remote: true,
    type: "Full-time",
    salary_display: "$165k–$205k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    url: "https://boards.greenhouse.io/airbnb/jobs/senior-ux-designer",
    description:
      "Airbnb is looking for a Senior UX Designer to craft accessible, research-driven experiences across the platform. You'll collaborate with researchers and engineers to ship end-to-end.",
    posted_at: "2026-09-06T20:00:00Z",
    authenticity_score: 90,
    quality_grade: "B",
    quality_score: 83,
    likely_duplicate: true,
    duplicate_group_id: "grp-airbnb-ux",
    cross_posting_ids: [501, 502],
    cross_postings: [
      { id: 501, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/airbnb/jobs/senior-ux-designer" },
      { id: 502, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/airbnb-senior-ux-designer" },
    ],
  },
  {
    id: 6,
    title: "Senior Product Designer",
    company: "Retool",
    location: "Remote · US",
    remote: true,
    type: "Full-time",
    salary_display: "$165k–$200k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    url: "https://boards.greenhouse.io/retool/jobs/senior-product-designer",
    description:
      "Retool is hiring a Senior Product Designer to design internal tools experiences. You'll work on complex, data-heavy workflows used by developers and operators.",
    posted_at: "2026-09-05T13:00:00Z",
    authenticity_score: 81,
    quality_grade: "B",
    quality_score: 82,
    consolidated_count: 2,
    consolidated_sources: ["Greenhouse", "Indeed"],
  },
  {
    id: 7,
    title: "UX Engineer",
    company: "Vercel",
    location: "Remote · Global",
    remote: true,
    type: "Full-time",
    salary_display: "$150k–$190k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/vercel-ux-engineer",
    description:
      "Vercel is looking for a UX Engineer who can bridge design and frontend. You'll build design systems, prototypes, and production interfaces in React.",
    posted_at: "2026-09-05T10:00:00Z",
    authenticity_score: 87,
    quality_grade: "B",
    quality_score: 80,
  },
  {
    id: 8,
    title: "Product Designer (Contract)",
    company: "Spotify",
    location: "Remote · Europe",
    remote: true,
    type: "Contract",
    salary_display: "$90/hr",
    source_display: "Indeed",
    source_platform: "indeed",
    url: "https://www.indeed.com/job/spotify-product-designer-contract",
    description:
      "Spotify is hiring a contract Product Designer to support growth initiatives on mobile. You'll design experiments and collaborate with a cross-functional pod.",
    posted_at: "2026-09-04T16:00:00Z",
    authenticity_score: 79,
    quality_grade: "C",
    quality_score: 77,
  },
  {
    id: 101,
    title: "Product Designer, AI",
    company: "Anthropic",
    location: "San Francisco",
    remote: false,
    type: "Full-time",
    salary_display: "$170k–$210k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/anthropic-product-designer-ai",
    description:
      "Anthropic is hiring a Product Designer to craft AI-native interfaces. You'll work closely with researchers and engineers to design trustworthy, human-centered AI products.",
    posted_at: "2026-09-06T14:00:00Z",
    authenticity_score: 89,
    quality_grade: "A",
    quality_score: 92,
    consolidated_count: 2,
    consolidated_sources: ["LinkedIn", "Greenhouse"],
  },
  {
    id: 102,
    title: "Design Engineer",
    company: "Vercel",
    location: "Remote",
    remote: true,
    type: "Full-time",
    salary_display: "$160k–$200k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    url: "https://boards.greenhouse.io/vercel/jobs/design-engineer",
    description:
      "Vercel is looking for a Design Engineer to build design systems and polished interfaces. You'll bridge design and frontend engineering across the product.",
    posted_at: "2026-09-04T09:30:00Z",
    authenticity_score: 85,
    quality_grade: "B",
    quality_score: 84,
    likely_duplicate: true,
    duplicate_group_id: "grp-vercel-design-engineer",
    cross_posting_ids: [201, 202],
    cross_postings: [
      { id: 201, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/vercel/jobs/design-engineer" },
      { id: 202, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/vercel-design-engineer" },
    ],
  },
  {
    id: 103,
    title: "Senior Product Designer",
    company: "Stripe",
    location: "Remote · US",
    remote: true,
    type: "Full-time",
    salary_display: "$175k–$215k",
    source_display: "Greenhouse",
    source_platform: "greenhouse",
    url: "https://boards.greenhouse.io/stripe/jobs/senior-product-designer",
    description:
      "Stripe is hiring a Senior Product Designer to shape payments experiences. You'll own complex fintech workflows and partner across product, engineering, and research.",
    posted_at: "2026-09-03T16:45:00Z",
    authenticity_score: 88,
    quality_grade: "A",
    quality_score: 90,
  },
  {
    id: 104,
    title: "UX Researcher",
    company: "Figma",
    location: "San Francisco · Hybrid",
    remote: false,
    type: "Full-time",
    salary_display: "$150k–$185k",
    source_display: "Indeed",
    source_platform: "indeed",
    url: "https://www.indeed.com/job/figma-ux-researcher",
    description:
      "Figma is hiring a UX Researcher to run mixed-methods studies that inform product direction. You'll partner with design and product teams to deeply understand users.",
    posted_at: "2026-09-01T11:20:00Z",
    authenticity_score: 86,
    quality_grade: "B",
    quality_score: 81,
    consolidated_count: 3,
    consolidated_sources: ["LinkedIn", "Indeed", "Glassdoor"],
  },
  {
    id: 105,
    title: "Brand Designer",
    company: "Linear",
    location: "Remote · Global",
    remote: true,
    type: "Full-time",
    salary_display: "$140k–$170k",
    source_display: "LinkedIn",
    source_platform: "linkedin",
    url: "https://www.linkedin.com/jobs/linear-brand-designer",
    description:
      "Linear is hiring a Brand Designer to evolve the visual identity across marketing and product. You'll craft a cohesive brand system and elevate every touchpoint.",
    posted_at: "2026-08-28T10:00:00Z",
    authenticity_score: 80,
    quality_grade: "C",
    quality_score: 74,
  },
];

export const mockApplications: MockApplication[] = [
  {
    id: 1001,
    job_id: 1,
    title: "Senior Product Designer",
    company: "Figma",
    status: "draft",
    location: "San Francisco · Remote",
    salary_display: "$160k–$195k",
    created_at: "2026-09-08T11:00:00Z",
    updated_at: "2026-09-08T11:00:00Z",
    job: {
      company: "Figma",
      title: "Senior Product Designer",
      url: "https://www.linkedin.com/jobs/figma-senior-product-designer",
      source_display: "LinkedIn",
      source_platform: "linkedin",
    },
  },
  {
    id: 1002,
    job_id: 3,
    title: "Design Lead, Payments",
    company: "Ramp",
    status: "submitted",
    location: "New York · Hybrid",
    salary_display: "$190k–$230k",
    created_at: "2026-09-07T19:00:00Z",
    updated_at: "2026-09-07T19:00:00Z",
    job: {
      company: "Ramp",
      title: "Design Lead, Payments",
      url: "https://www.linkedin.com/jobs/ramp-design-lead-payments",
      source_display: "LinkedIn",
      source_platform: "linkedin",
      likely_duplicate: true,
      duplicate_group_id: "grp-ramp-payments",
      cross_posting_ids: [301, 302, 303],
      cross_postings: [
        { id: 301, source_platform: "LinkedIn", url: "https://www.linkedin.com/jobs/ramp-design-lead-payments" },
        { id: 302, source_platform: "Indeed", url: "https://www.indeed.com/job/ramp-design-lead-payments" },
        { id: 303, source_platform: "Greenhouse", url: "https://boards.greenhouse.io/ramp/jobs/design-lead-payments" },
      ],
    },
  },
  {
    id: 1003,
    job_id: 2,
    title: "Staff Product Designer",
    company: "Linear",
    status: "interviewing",
    location: "Remote · US",
    salary_display: "$180k–$220k",
    created_at: "2026-09-05T14:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
    job: {
      company: "Linear",
      title: "Staff Product Designer",
      url: "https://boards.greenhouse.io/linear/jobs/staff-product-designer",
      source_display: "LinkedIn",
      source_platform: "linkedin",
      consolidated_count: 3,
      consolidated_sources: ["LinkedIn", "Greenhouse", "Indeed"],
    },
  },
  {
    id: 1004,
    job_id: 4,
    title: "Product Designer, Growth",
    company: "Notion",
    status: "offer",
    location: "San Francisco",
    salary_display: "$150k–$185k",
    created_at: "2026-09-02T09:00:00Z",
    updated_at: "2026-09-07T17:00:00Z",
    job: {
      company: "Notion",
      title: "Product Designer, Growth",
      url: "https://www.linkedin.com/jobs/notion-product-designer-growth",
      source_display: "LinkedIn",
      source_platform: "linkedin",
    },
  },
];