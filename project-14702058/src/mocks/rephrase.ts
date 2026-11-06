// Demo rephrase suggestions for preview builds (no live backend).
// One option carries a flagged figure so the invented-metrics safeguard is demoable.
export const mockRephraseOptions = [
  {
    text: "Delivered the platform migration ahead of schedule, cutting release overhead for the whole team.",
    flagged_metrics: [],
  },
  {
    text: "Drove the platform migration and reduced release overhead by 40% across the team.",
    flagged_metrics: [
      {
        value: "40%",
        field: "rephrase",
        text: "reduced release overhead by 40% across the team",
      },
    ],
  },
  {
    text: "Spearheaded the platform migration, shipping customer-facing improvements faster.",
    flagged_metrics: [],
  },
];