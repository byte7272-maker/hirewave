// Sample response for `POST /api/v1/resumes/{id}/improve-structured` used in
// preview mode. Mirrors the StructuredImprovement shape: an improved JSON Resume
// object, its canonical markdown, and the figures the AI added that aren't in the
// original (flagged so the user can verify them). Standalone — mocks never import.

export const mockStructuredImprovement = {
  structured: {
    basics: {
      name: "Jordan Reyes",
      label: "Senior Product Designer",
      email: "jordan.reyes@example.com",
      phone: "+1 (415) 555-0182",
      url: "jordanreyes.design",
      summary:
        "Product designer with 8+ years shaping design systems and end-to-end product experiences for B2B SaaS. I pair strong systems thinking with hands-on prototyping to turn ambiguous problems into shipped, measurable outcomes — most recently cutting new-screen build time by 38% across six product teams.",
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
          "Ran a quarterly research cadence that fed 20+ validated improvements into the roadmap, doubling research throughput.",
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
      },
    ],
    skills: [
      {
        name: "Design",
        keywords: [
          "Design systems",
          "Interaction design",
          "Prototyping",
          "Accessibility",
          "Information architecture",
        ],
      },
      { name: "Tools", keywords: ["Figma", "Framer", "Storybook", "Principle"] },
      { name: "Research", keywords: ["Usability testing", "Qualitative interviews", "Surveys"] },
      { name: "Technical", keywords: ["React", "HTML/CSS", "Design tokens"] },
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
        url: "github.com/northwind/design-system",
      },
    ],
    certificates: [
      {
        name: "IAAP Certified Professional in Accessibility Core Competencies",
        issuer: "IAAP",
        date: "2022-08",
      },
    ],
    awards: [],
  },
  markdown:
    "# Jordan Reyes\n\n**Senior Product Designer**\n\njordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA · jordanreyes.design\n\n## Summary\n\nProduct designer with 8+ years shaping design systems and end-to-end product experiences for B2B SaaS.\n\n## Experience\n\n### Senior Product Designer — Northwind Analytics\n\n- Built and open-sourced a 120-component design system adopted by 6 product teams, cutting new-screen build time by 38%.\n- Redesigned the core dashboard, lifting weekly active usage of saved reports by 27%.\n- Ran a quarterly research cadence that fed 20+ validated improvements into the roadmap, doubling research throughput.\n\n## Skills\n\nDesign systems, Interaction design, Prototyping, Accessibility · Figma, Framer, Storybook · React, HTML/CSS, Design tokens",
  flagged_metrics: [
    {
      value: "38%",
      field: "work[0].highlights[0]",
      text: "Built and open-sourced a 120-component design system adopted by 6 product teams, cutting new-screen build time by 38%.",
    },
    {
      value: "38%",
      field: "basics.summary",
      text: "...turning ambiguous problems into shipped, measurable outcomes — most recently cutting new-screen build time by 38% across six product teams.",
    },
  ],
};