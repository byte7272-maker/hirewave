// Demo postings for the ingest button — a strong match, a couple of adjacent
// roles, and a deliberately fraudulent posting so the verification engine's
// filtering is visible in the UI.

export const SAMPLE_JOBS = [
  {
    source_platform: "linkedin",
    title: "Senior Backend Engineer",
    company: "Globex",
    company_domain: "globex.com",
    location: "Remote",
    remote: true,
    description:
      "Build Python microservices with FastAPI and PostgreSQL on AWS. Own services in Docker and Kubernetes, optimize Redis caching, and design REST APIs. 6+ years required.",
    requirements: ["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
    salary_range: { currency: "USD", minimum: 160000, maximum: 210000 },
    url: "https://linkedin.com/jobs/globex-sbe",
  },
  {
    source_platform: "greenhouse",
    title: "Platform Engineer",
    company: "Initech",
    company_domain: "initech.com",
    location: "New York, NY",
    remote: false,
    description:
      "Platform team seeks an engineer strong in Kubernetes, Docker, Terraform and AWS to build internal developer tooling and CI/CD. Python a plus.",
    requirements: ["Kubernetes", "AWS", "Terraform", "CI/CD"],
    salary_range: { currency: "USD", minimum: 150000, maximum: 190000 },
    url: "https://boards.greenhouse.io/initech/platform",
  },
  {
    source_platform: "indeed",
    title: "Full-Stack Developer",
    company: "Umbrella Software",
    company_domain: "umbrella.dev",
    location: "Remote",
    remote: true,
    description:
      "Work across a React front end and a Python/FastAPI backend with PostgreSQL. Comfortable owning features end to end.",
    requirements: ["Python", "React", "FastAPI", "PostgreSQL"],
    salary_range: { currency: "USD", minimum: 130000, maximum: 165000 },
    url: "https://indeed.com/jobs/umbrella-fsd",
  },
  {
    source_platform: "unknown_board",
    title: "Work From Home Data Entry",
    company: "QuickCash LLC",
    company_domain: "",
    location: "Remote",
    remote: true,
    description:
      "URGENT! Apply now! Immediate start! No experience needed. Guaranteed income — earn $5000 a week! Be your own boss! Contact us on WhatsApp to start tomorrow. Limited spots!",
    requirements: [],
    url: "http://sketchy.example/data-entry",
  },
];
