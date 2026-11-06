// Sample applications parked for the user's approval, used only to preview the
// Approvals screen without a live backend. Matches the ApprovalItem shape
// returned by GET /api/v1/auto-apply/approvals.

export const mockApprovals = [
  {
    application_id: 4821,
    job_posting_id: 90210,
    title: "Senior Product Designer",
    company: "Figma",
    provider: "greenhouse",
    created_at: "2026-09-30T09:12:00Z",
  },
  {
    application_id: 4822,
    job_posting_id: 90214,
    title: "Staff Frontend Engineer",
    company: "Ramp",
    provider: "indeed",
    created_at: "2026-09-30T08:40:00Z",
  },
  {
    application_id: 4823,
    job_posting_id: 90221,
    title: "Lead Product Manager",
    company: "Notion",
    provider: "lever",
    created_at: "2026-09-30T07:55:00Z",
  },
  {
    application_id: 4824,
    job_posting_id: 90230,
    title: "Design Systems Engineer",
    company: "Linear",
    provider: "ashby",
    created_at: "2026-09-29T17:20:00Z",
  },
];

// The résumé + cover letter the assistant prepared for each parked application,
// keyed by application id. Preview-only stand-in for
// GET /api/v1/auto-apply/approvals/{id}/prepared.

export const mockPreparedMaterials = {
  "4821": {
    resume: {
      title: "Alex Morgan — Senior Product Designer",
      updated_at: "2026-09-30T09:10:00Z",
      content: `ALEX MORGAN
Senior Product Designer · San Francisco, CA
alex.morgan@email.com · linkedin.com/in/alexmorgan · alexmorgan.design

SUMMARY
Product designer with 9 years shaping consumer and B2B SaaS experiences. I turn ambiguous
problems into shipped, measurable interfaces — pairing strong craft with research, systems
thinking, and close partnership with engineering.

EXPERIENCE
Senior Product Designer — Lumen Labs · 2021–Present
• Led the end-to-end redesign of the onboarding flow, lifting activation 23% and cutting
  time-to-first-value from 4 days to under 1.
• Built and documented a 60-component design system adopted by 4 product teams.
• Ran a continuous research program (interviews, usability tests) that shaped the quarterly roadmap.

Product Designer — Northwind · 2018–2021
• Designed the mobile checkout used by 2M+ monthly customers; reduced drop-off 18%.
• Partnered with data science to build experiment templates still used company-wide.

SKILLS
Design systems · Figma · Prototyping · User research · Accessibility · Motion

EDUCATION
BFA, Interaction Design — California College of the Arts`,
    },
    cover_letter: {
      title: "Cover letter — Figma",
      updated_at: "2026-09-30T09:11:00Z",
      content: `Dear Figma Hiring Team,

I'm applying for the Senior Product Designer role. I've spent the last several years living
inside design tools — and few products have shaped how our whole industry works the way Figma
has. The chance to help craft that surface is genuinely exciting to me.

In my current role I led a redesign that lifted activation 23%, but the part I'm proudest of is
how it happened: a tight loop of research, rapid prototypes, and engineers in the room from day
one. I care about the details, but I care just as much about the system that makes good details
repeatable.

I'd love to bring that mix of craft and systems thinking to your team. Thank you for your time
and consideration.

Warm regards,
Alex Morgan`,
    },
  },
  "4822": {
    resume: {
      title: "Alex Morgan — Staff Frontend Engineer",
      updated_at: "2026-09-30T08:38:00Z",
      content: `ALEX MORGAN
Staff Frontend Engineer · San Francisco, CA
alex.morgan@email.com · github.com/alexmorgan

SUMMARY
Frontend engineer with 10 years building fast, accessible, maintainable web products. Strong on
React, TypeScript, and design systems, with a track record of raising the technical bar across teams.

EXPERIENCE
Staff Engineer — Lumen Labs · 2020–Present
• Architected a component platform powering 12 consumer surfaces; cut bundle size 34%.
• Introduced a typed API layer and testing strategy that reduced production incidents 40%.
• Mentored 6 engineers; two promoted to senior within a year.

Senior Engineer — Northwind · 2016–2020
• Rebuilt the checkout SPA, improving Lighthouse performance from 61 to 96.

SKILLS
React · TypeScript · Next.js · TailwindCSS · Design systems · Web performance · Accessibility

EDUCATION
BSc, Computer Science — University of Washington`,
    },
    cover_letter: {
      title: "Cover letter — Ramp",
      updated_at: "2026-09-30T08:39:00Z",
      content: `Dear Ramp Team,

I'm writing to apply for the Staff Frontend Engineer position. I admire how much of Ramp's
experience is built on a fast, trustworthy frontend — and that's exactly the kind of problem
space I enjoy most.

Over the past several years I've built component platforms that scaled to a dozen product
surfaces, cut bundle size by a third, and measurably reduced incidents through better typing and
testing. I like working close to the metal on performance and close to designers on craft — the
place where both meet is usually where the product wins.

I'd welcome the chance to talk about how I can help raise the bar on your web experience.

Best regards,
Alex Morgan`,
    },
  },
  "4823": {
    resume: {
      title: "Alex Morgan — Lead Product Manager",
      updated_at: "2026-09-30T07:52:00Z",
      content: `ALEX MORGAN
Lead Product Manager · San Francisco, CA
alex.morgan@email.com · linkedin.com/in/alexmorgan

SUMMARY
Product leader with 8 years shipping tools people rely on daily. I pair clear strategy with a
bias for shipping, and I keep the customer's voice at the center of every roadmap decision.

EXPERIENCE
Senior Product Manager — Lumen Labs · 2021–Present
• Owned a $12M ARR product line, growing activation 23% and retention 11% YoY.
• Shipped a self-serve onboarding that removed 70% of sales-assisted signups.

Product Manager — Northwind · 2018–2021
• Launched a collaboration feature adopted by 40% of active accounts in 6 months.

SKILLS
Product strategy · Discovery · Roadmapping · Experimentation · Analytics · Team leadership

EDUCATION
MBA — UC Berkeley Haas`,
    },
    cover_letter: {
      title: "Cover letter — Notion",
      updated_at: "2026-09-30T07:53:00Z",
      content: `Dear Notion Team,

I'd like to be considered for the Lead Product Manager role. Notion's bet — that tools should
bend to how people actually think — is one I've built my career around.

Most recently I owned a product line where I grew activation 23% and retention 11% year over
year, but the decisions behind those numbers came from relentless, humbling discovery work. I
believe the best roadmaps are earned, not asserted.

I'd love the chance to bring that discipline to your team and help more people make Notion the
place their work lives.

Thank you for your consideration,
Alex Morgan`,
    },
  },
  "4824": {
    resume: {
      title: "Alex Morgan — Design Systems Engineer",
      updated_at: "2026-09-29T17:18:00Z",
      content: `ALEX MORGAN
Design Systems Engineer · San Francisco, CA
alex.morgan@email.com · github.com/alexmorgan

SUMMARY
Engineer at the seam between design and code. I build component libraries, tokens, and tooling
that let teams ship consistent interfaces fast — without fighting their own stack.

EXPERIENCE
Staff Engineer — Lumen Labs · 2020–Present
• Shipped a token-driven component library used across 4 product teams.
• Automated visual regression + a11y checks in CI, catching defects before release.

Senior Engineer — Northwind · 2016–2020
• Built the front-end for the design system powering the company's marketing and app surfaces.

SKILLS
Design tokens · React · TypeScript · Storybook · a11y · CI/CD · Documentation

EDUCATION
BSc, Computer Science — University of Washington`,
    },
    cover_letter: {
      title: "Cover letter — Linear",
      updated_at: "2026-09-29T17:19:00Z",
      content: `Dear Linear Team,

I'm applying for the Design Systems Engineer role. Linear sets the bar for what a fast, focused,
opinionated product can feel like — and I'd love to help build the systems underneath that feel.

I've spent recent years shipping token-driven component libraries and wiring a11y and visual
regression checks into CI so quality holds as teams scale. I care about the boring, load-bearing
work that lets everyone else move quickly.

I'd welcome the chance to talk about how I can help keep your interface crisp as you grow.

Sincerely,
Alex Morgan`,
    },
  },
};