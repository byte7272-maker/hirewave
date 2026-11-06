// Sample tailor-to-job fit response used to preview the cover-letter
// "Tailor for a job" panel without a live backend. Matches the
// CoverLetterTailorResult shape consumed by CoverLetterTailorPanel.

export const mockCoverLetterTailorResult = {
  fit_score: 84,
  addressed: [
    "Role alignment",
    "Relevant experience",
    "Enthusiasm",
    "Specific examples",
    "Company research",
  ],
  missing_points: [
    "Quantified impact",
    "Team leadership",
    "Domain expertise",
  ],
  qualifications:
    "They want a candidate who can articulate clear ownership, back claims with measurable results, and show genuine familiarity with the company's product and mission. Leadership and domain depth are called out explicitly.",
  summary:
    "Your letter reads warmly and shows strong alignment with the role and clear company knowledge. The main gaps are concrete, quantified outcomes and a clearer signal of team leadership and domain depth.",
  tailoring: [
    {
      title: "Quantify your impact",
      detail:
        "Replace general statements with numbers — e.g. 'grew retention 12%' — to make outcomes concrete.",
      severity: "critical",
    },
    {
      title: "Lead with leadership examples",
      detail:
        "Name a team you led and the result, since the posting emphasizes leadership.",
      severity: "important",
    },
    {
      title: "Add domain specificity",
      detail:
        "Reference a relevant industry metric or tool to close the domain-expertise gap.",
      severity: "important",
    },
    {
      title: "Tighten the opening",
      detail:
        "Cut the generic 'I am excited to apply' and open with a specific, memorable hook.",
      severity: "suggestion",
    },
  ],
};