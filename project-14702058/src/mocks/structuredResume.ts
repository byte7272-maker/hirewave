// Sample JSON Resume object used to preview the résumé template gallery without a
// live backend (`GET /api/v1/resumes/{id}/structured`). Mirrors the schema in
// `src/lib/jsonResume.ts` so every theme renders the same realistic data.

export const mockStructuredResume = {
  basics: {
    name: "Jordan Reyes",
    label: "Senior Product Designer",
    email: "jordan.reyes@example.com",
    phone: "+1 (415) 555-0182",
    url: "jordanreyes.design",
    summary:
      "Product designer with 8+ years shaping design systems and end-to-end product experiences for B2B SaaS. I pair strong systems thinking with hands-on prototyping, and I love turning ambiguous problems into shipped, measurable outcomes.",
    location: {
      city: "San Francisco",
      region: "CA",
      countryCode: "US",
    },
    profiles: [
      { network: "LinkedIn", username: "jordanreyes", url: "linkedin.com/in/jordanreyes" },
      { network: "GitHub", username: "jreyes", url: "github.com/jreyes" },
      { network: "Website", username: "jordanreyes.design", url: "jordanreyes.design" },
    ],
  },
  work: [
    {
      name: "Northwind Analytics",
      position: "Senior Product Designer",
      url: "northwind.com",
      startDate: "2021-03",
      endDate: "",
      summary:
        "Lead designer for the platform team, owning the design system and the analytics workspace used by 40k+ customers.",
      highlights: [
        "Built and open-sourced a 120-component design system adopted by 6 product teams, cutting new-screen build time by 38%.",
        "Redesigned the core dashboard, lifting weekly active usage of saved reports by 27%.",
        "Ran a quarterly research cadence that fed 20+ validated improvements into the roadmap.",
      ],
    },
    {
      name: "Lumen Labs",
      position: "Product Designer",
      url: "",
      startDate: "2018-06",
      endDate: "2021-02",
      summary:
        "Owned onboarding and growth surfaces for a developer-tools startup, from first concept to shipped experiments.",
      highlights: [
        "Redesigned onboarding, improving activation from 41% to 58% over two quarters.",
        "Shipped an A/B testing program that ran 30+ experiments and standardized measurement.",
        "Partnered with engineering to introduce a token-based theming layer across the product.",
      ],
    },
    {
      name: "Brightside Studio",
      position: "UX Designer",
      url: "",
      startDate: "2016-01",
      endDate: "2018-05",
      summary:
        "Client-side UX and visual design across fintech, healthcare, and consumer projects.",
      highlights: [
        "Delivered 15+ end-to-end engagements from discovery through design QA.",
        "Introduced accessibility audits as a standard deliverable, raising WCAG compliance across clients.",
      ],
    },
  ],
  education: [
    {
      institution: "Rhode Island School of Design",
      area: "Interaction Design",
      studyType: "BFA",
      startDate: "2012-09",
      endDate: "2016-05",
      score: "3.8 / 4.0",
      courses: ["Interaction Design", "Human Factors", "Typography"],
    },
  ],
  skills: [
    {
      name: "Design",
      level: "Expert",
      keywords: ["Design systems", "Interaction design", "Prototyping", "Accessibility", "Information architecture"],
    },
    {
      name: "Tools",
      level: "Expert",
      keywords: ["Figma", "Framer", "Storybook", "Principle"],
    },
    {
      name: "Research",
      level: "Advanced",
      keywords: ["Usability testing", "Qualitative interviews", "Surveys"],
    },
    {
      name: "Technical",
      level: "Working",
      keywords: ["React", "HTML/CSS", "Design tokens"],
    },
  ],
  languages: [
    { language: "English", fluency: "Native speaker" },
    { language: "Spanish", fluency: "Professional working proficiency" },
  ],
  projects: [
    {
      name: "Northwind Design System",
      description:
        "An open-source, token-driven component library and Figma kit powering six product teams.",
      keywords: ["Design systems", "Tokens", "Figma"],
      startDate: "2021-06",
      endDate: "2023-11",
      url: "github.com/northwind/design-system",
    },
  ],
  certificates: [
    { name: "IAAP Certified Professional in Accessibility Core Competencies", issuer: "IAAP", date: "2022-08" },
  ],
  awards: [
    {
      title: "Best in Show — Product Design",
      awarder: "Awwwards",
      date: "2019-10",
      summary: "Recognized for the Lumen Labs onboarding redesign.",
    },
  ],
  interests: [
    { name: "Bouldering", keywords: ["Climbing", "Outdoors"] },
    { name: "Generative art", keywords: ["Creative coding"] },
  ],
};