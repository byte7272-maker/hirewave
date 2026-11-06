/**
 * Demo data for the "My Work Highlights" flow, used in preview mode. In
 * preview mode. In production the prompts come from the backend so they can be
 * tailored to the target job — these mirror the shape it returns.
 *
 * Project Harbor never reads company data itself: the user copies a prompt out,
 * runs it in their own company AI (Copilot, Teams, chat, docs, calendar), and
 * pastes the answer back. Nothing leaves the app until they do.
 */

export const evidenceGuidance =
  "This wizard pulls out your work highlights from what you paste back — and nothing else. Only run these prompts where your company's data policies allow it, and never paste anything you're not cleared to share. Project Harbor can't see your company tools — you copy a prompt out, run it there, and paste the answer back here yourself.";

export const evidencePrompts = [
  {
    category: "Wins & outcomes",
    title: "Shipped projects",
    prompt:
      "Looking back over the last 18 months, list the projects or features I shipped. For each, give me: what it was, who it was for, the outcome or result, and any numbers (users, revenue, time saved, adoption). Write each as a single sentence I could put on a résumé.",
  },
  {
    category: "Wins & outcomes",
    title: "Times I led or unblocked",
    prompt:
      "From my messages, docs, and meeting notes, find moments where I led, coordinated, or unblocked other people. Summarise each as an achievement sentence that shows scope (how many people / teams) and the result.",
  },
  {
    category: "Scope & scale",
    title: "Size of what I own",
    prompt:
      "Help me quantify the scale of my work: what services, systems, budgets, headcount, or regions am I responsible for, and roughly how large are they? Turn each into a concrete, measurable statement.",
  },
  {
    category: "Impact & metrics",
    title: "Numbers behind my work",
    prompt:
      "Search my docs and dashboards for concrete metrics tied to my work — performance improvements, cost savings, growth, quality gains, or efficiency. List each metric with its baseline and the improvement I contributed.",
  },
  {
    category: "Recognition",
    title: "Praise & recognition",
    prompt:
      "Find any kudos, awards, positive feedback, or customer praise I received from managers, peers, or customers. Quote the substance briefly and turn each into a résumé-ready highlight.",
  },
  {
    category: "Skills in practice",
    title: "Skills I actually used",
    prompt:
      "From my recent work, list the tools, technologies, methods, and domains I actually worked in (not just what I list on a profile). Group them into skill areas with the most relevant keywords under each.",
  },
];

export const evidencePromptsMock = {
  guidance: evidenceGuidance,
  prompts: evidencePrompts,
};