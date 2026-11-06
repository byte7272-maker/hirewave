// Sample tailor-to-job fit response used to preview the résumé "Tailor to a job"
// panel without a live backend. Matches the TailorResult shape consumed by the
// TailorPanel component.

export const mockTailorResult = {
  fit_score: 88,
  matching_skills: [
    "Design systems",
    "Prototyping",
    "Figma",
    "Cross-functional collaboration",
    "End-to-end ownership",
  ],
  missing_keywords: [
    "Motion design",
    "Accessibility audits",
    "Data-informed iteration",
  ],
  qualifications:
    "They're looking for a designer who has shipped design systems at scale, prototyped complex interactions, and partnered closely with engineering and research. Strong ownership and a quality bar that lifts the whole product are table stakes.",
  summary:
    "You line up well on systems work, prototyping, and Figma depth. The main gaps are motion design fluency and explicit accessibility auditing, plus more concrete examples of data-informed iteration.",
  tailoring: [
    {
      title: "Lead with design systems impact",
      detail:
        "Move your systems work to the top and quantify the number of engineers and products it accelerated.",
      severity: "critical",
    },
    {
      title: "Surface accessibility work",
      detail:
        "Add a bullet naming WCAG audits you've run and the concrete outcomes, since the posting calls it out explicitly.",
      severity: "important",
    },
    {
      title: "Add a motion prototype",
      detail:
        "Reference a shipped interaction prototype or micro-interaction to close the motion design gap.",
      severity: "important",
    },
    {
      title: "Quantify outcomes",
      detail:
        "Replace vague verbs with metrics — e.g. \"reduced handoff time by 30%\" — to back the data-informed expectation.",
      severity: "suggestion",
    },
  ],
};