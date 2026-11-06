// Sample response for `POST /api/v1/cover-letters/{id}/improve-structured` used
// in preview mode. Mirrors the CoverLetterStructuredImprovement shape: an
// improved structured cover letter, its canonical markdown, and the figures the
// AI added that aren't in the original (flagged so the user can verify them).
// Standalone — mocks never import.

export const mockCoverLetterImprovement = {
  structured: {
    name: "Jordan Reyes",
    label: "Senior Product Designer",
    contact: [
      "jordan.reyes@example.com",
      "+1 (415) 555-0182",
      "San Francisco, CA",
      "jordanreyes.design",
    ],
    date: "September 22, 2026",
    company: "Northwind Analytics",
    role: "Senior Product Designer",
    salutation: "Dear Hiring Team,",
    paragraphs: [
      "I'm applying for the Senior Product Designer role at Northwind Analytics, where your focus on design systems at scale lines up directly with the last four years of my work. As lead designer for a platform team, I built a 120-component design system adopted by six product teams — and cut new-screen build time by 38% in the process.",
      "What draws me to Northwind specifically is the analytics workspace itself. I redesigned a comparable dashboard for 40k+ customers and lifted weekly active usage of saved reports by 27%, so I know the levers that make dense data products feel approachable. I pair systems thinking with hands-on prototyping to turn ambiguous problems into shipped, measurable outcomes.",
      "Beyond the craft, I bring a research habit — running a quarterly cadence that fed 20+ validated improvements into the roadmap — and a track record of partnering closely with engineering on token-based theming. I'd be glad to walk through how that experience maps to your roadmap.",
    ],
    closing: "Thanks for your time and consideration.",
    signature: "Jordan Reyes",
  },
  markdown:
    "# Jordan Reyes\n\n**Senior Product Designer**\n\njordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA · jordanreyes.design\n\nSeptember 22, 2026\n\nSenior Product Designer\nNorthwind Analytics\n\nDear Hiring Team,\n\nI'm applying for the Senior Product Designer role at Northwind Analytics, where your focus on design systems at scale lines up directly with the last four years of my work.\n\nWhat draws me to Northwind specifically is the analytics workspace itself, and the chance to shape dense data products.\n\nBeyond the craft, I bring a research habit and a track record of partnering closely with engineering.\n\nThanks for your time and consideration.\n\nJordan Reyes",
  flagged_metrics: [
    {
      value: "38%",
      field: "paragraphs[0]",
      text: "...I built a 120-component design system adopted by six product teams — and cut new-screen build time by 38% in the process.",
    },
    {
      value: "27%",
      field: "paragraphs[1]",
      text: "...I redesigned a comparable dashboard for 40k+ customers and lifted weekly active usage of saved reports by 27%...",
    },
  ],
};