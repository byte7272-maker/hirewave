// Sample documents used to back the Documents area (résumés + cover letters)
// when the app runs in preview mode (`__IS_PREVIEW__`) with no live backend.
// Mirrors the shapes in `src/lib/documents.ts` so the lists, quick preview, and
// editors all render realistic content. Standalone data only — no imports,
// no functions, no dynamic values.
//
// Each saved VERSION carries its own `content`, so switching versions actually
// changes what the viewer renders (the live backend embeds per-version text the
// same way). The résumé record's `rendered_text` mirrors its active version.

// ---- Résumé 101: three distinct saved versions -----------------------------

const resume101V1 = `# Jordan Reyes
**Product Designer**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA

## Summary
Product designer with a background in UX and visual design across SaaS and agency projects. Comfortable owning features from concept to launch alongside engineers and product managers.

## Experience
### Product Designer — Northwind Analytics (2021-03 – Present)
- Worked on the core dashboard and reporting surfaces.
- Contributed components to the shared design library.

### Product Designer — Lumen Labs (2018-06 – 2021-02)
- Helped redesign the sign-up and onboarding flows.
- Partnered with engineering on front-end implementation details.

### UX Designer — Brightside Studio (2016-01 – 2018-05)
- Delivered UX and visual design across fintech and healthcare clients.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)

## Skills
Sketch, Figma, Prototyping, Usability testing, HTML/CSS`;

const resume101V2 = `# Jordan Reyes
**Senior Product Designer**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA · jordanreyes.design

## Summary
Senior product designer targeting platform and systems work. I partner closely with engineering and research to ship products that scale, with a track record of leading design systems and data-heavy interfaces.

## Experience
### Senior Product Designer — Northwind Analytics (2021-03 – Present)
Design lead for the analytics workspace and the shared design system.
- Led the design system effort now used across the product organization.
- Redesigned the core dashboard to make dense reporting easier to scan.
- Established a quarterly research cadence feeding the product roadmap.

### Product Designer — Lumen Labs (2018-06 – 2021-02)
Owned onboarding and growth surfaces end to end.
- Redesigned onboarding to improve activation.
- Introduced a token-based theming layer across the product.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)
3.8 / 4.0

## Skills
Design systems, Interaction design, Prototyping, Accessibility, Figma, Framer, Storybook, React, Design tokens`;

const resume101V3 = `# Jordan Reyes
**Senior Product Designer**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA · jordanreyes.design

## Summary
Product designer with 8+ years shaping design systems and end-to-end product experiences for B2B SaaS. I pair strong systems thinking with hands-on prototyping, turning ambiguous problems into shipped, measurable outcomes.

## Experience
### Senior Product Designer — Northwind Analytics (2021-03 – Present)
Lead designer for the platform team, owning the design system and the analytics workspace used by 40k+ customers.
- Built and open-sourced a 120-component design system adopted by 6 product teams, cutting new-screen build time by 38%.
- Redesigned the core dashboard, lifting weekly active usage of saved reports by 27%.
- Ran a quarterly research cadence that fed 20+ validated improvements into the roadmap.

### Product Designer — Lumen Labs (2018-06 – 2021-02)
Owned onboarding and growth surfaces for a developer-tools startup, from first concept to shipped experiments.
- Redesigned onboarding, improving activation from 41% to 58% over two quarters.
- Shipped an A/B testing program that ran 30+ experiments and standardized measurement.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)
3.8 / 4.0

## Skills
Design systems, Interaction design, Prototyping, Accessibility, Information architecture, Figma, Framer, Storybook, React, Design tokens`;

// ---- Résumé 102: two distinct saved versions -------------------------------

const resume102V1 = `# Jordan Reyes
**Product Designer**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA

## Summary
Product designer with experience across design systems and product surfaces. I enjoy the systems side of design — components, tokens, and the tooling that keeps a product consistent.

## Experience
### Product Designer — Northwind Analytics (2021-03 – Present)
- Built components for the shared design library.
- Supported design reviews across the platform team.

### Product Designer — Lumen Labs (2018-06 – 2021-02)
- Worked on the design system and growth surfaces.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)

## Skills
Design systems, Figma, Storybook, Accessibility`;

const resume102V2 = `# Jordan Reyes
**Staff Product Designer**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA · jordanreyes.design

## Summary
Systems-minded staff designer focused on component libraries, design tokens, and cross-team adoption. I set the bar for craft and build the infrastructure other designers and engineers build on.

## Experience
### Senior Product Designer — Northwind Analytics (2021-03 – Present)
- Architected a token-driven component library now used by six product teams.
- Led design reviews and mentored two mid-level designers.
- Defined the accessibility standards adopted across the platform.

### Product Designer — Lumen Labs (2018-06 – 2021-02)
- Introduced a token-based theming layer across the product.
- Standardized measurement for growth experiments.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)
3.8 / 4.0

## Skills
Design systems, Design tokens, Component libraries, Accessibility, Figma, Storybook, React`;

// ---- Résumés 103–105: single saved versions --------------------------------

const resume103V1 = `# Jordan Reyes
**Design Lead, Payments**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA

## Summary
Design leader focused on payments and fintech. I run design reviews, coach designers, and set direction for complex, high-stakes product areas.

## Experience
### Senior Product Designer — Northwind Analytics (2021-03 – Present)
- Led design for a payments-adjacent dashboard used by thousands of finance teams.
- Coached and mentored designers on the team.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)

## Skills
Design leadership, Payments, Design reviews, Prototyping, Figma`;

const resume104V1 = `# Jordan Reyes
**Product Designer, Growth**
jordan.reyes@example.com · +1 (415) 555-0182 · San Francisco, CA

## Summary
Growth-focused product designer working at the intersection of craft, data, and speed. I design onboarding and activation experiences and run experiments that move the numbers.

## Experience
### Product Designer — Lumen Labs (2018-06 – 2021-02)
- Redesigned onboarding, improving activation from 41% to 58% over two quarters.
- Ran an experiment program that shipped 30+ tests with a shared measurement standard.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)

## Skills
Growth design, Onboarding, Experimentation, Figma, Analytics`;

const resume105V1 = `# Jordan Reyes
**Senior UX Designer**
jordan.reyes@example.com · San Francisco, CA

## Summary
Senior UX designer with a broad background across product and agency work. Comfortable owning research, interaction design, and visual polish end to end.

## Experience
### UX Designer — Brightside Studio (2016-01 – 2018-05)
- Delivered end-to-end engagements from discovery through design QA.
- Introduced accessibility audits as a standard deliverable.

## Education
### BFA, Interaction Design — Rhode Island School of Design (2012-09 – 2016-05)

## Skills
UX design, Research, Prototyping, Accessibility, Sketch`;

export const mockDocumentsResumes = [
  {
    id: 101,
    original_filename: "Jordan-Reyes-Resume-2026.pdf",
    target_role: "Senior Product Designer",
    source: "uploaded",
    template_id: "modern",
    created_at: "2026-09-18T15:20:00.000Z",
    updated_at: "2026-09-27T11:05:00.000Z",
    rendered_text: resume101V3,
    quality_grade: "A",
    quality_score: 92,
    flagged: false,
    archived: false,
    summarized_at: "2026-09-18T15:25:00.000Z",
    content_summary:
      "Product designer with 8+ years shaping design systems and end-to-end product experiences for B2B SaaS. Strong systems thinking paired with hands-on prototyping; measurable outcomes across onboarding, dashboards, and design-system work.",
    active_version: 3,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-09-18T15:20:00.000Z", content: resume101V1 },
      { version: 2, label: "Tailored to Senior Product Designer", source: "generated", job_title: "Senior Product Designer", created_at: "2026-09-22T09:10:00.000Z", content: resume101V2 },
      { version: 3, label: "Strengthened impact bullets", source: "generated", created_at: "2026-09-27T11:05:00.000Z", content: resume101V3 },
    ],
  },
  {
    id: 102,
    original_filename: "Jordan-Reyes-Design-Systems.pdf",
    target_role: "Staff Product Designer",
    source: "uploaded",
    template_id: "sidebar",
    created_at: "2026-09-12T10:05:00.000Z",
    updated_at: "2026-09-24T16:40:00.000Z",
    rendered_text: resume102V2,
    quality_grade: "B",
    quality_score: 84,
    flagged: true,
    archived: false,
    content_summary:
      "Systems-heavy variant emphasizing component libraries, tokens, and cross-team adoption. Slightly thinner on quantified outcomes, which is why it is flagged for a second look.",
    active_version: 2,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-09-12T10:05:00.000Z", content: resume102V1 },
      { version: 2, label: "Tailored to Staff Product Designer", source: "generated", job_title: "Staff Product Designer", created_at: "2026-09-24T16:40:00.000Z", content: resume102V2 },
    ],
  },
  {
    id: 103,
    original_filename: "Jordan-Reyes-Fintech.pdf",
    target_role: "Design Lead, Payments",
    source: "uploaded",
    template_id: "elegant",
    created_at: "2026-09-08T13:30:00.000Z",
    updated_at: "2026-09-21T08:15:00.000Z",
    rendered_text: resume103V1,
    quality_grade: "A",
    quality_score: 88,
    flagged: false,
    archived: false,
    content_summary:
      "Leadership-forward résumé aimed at fintech, highlighting team direction, design reviews, and a payments-adjacent case study.",
    active_version: 1,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-09-08T13:30:00.000Z", content: resume103V1 },
    ],
  },
  {
    id: 104,
    original_filename: "Jordan-Reyes-Growth.pdf",
    target_role: "Product Designer, Growth",
    source: "uploaded",
    template_id: "minimal",
    created_at: "2026-09-02T09:45:00.000Z",
    updated_at: "2026-09-19T14:20:00.000Z",
    rendered_text: resume104V1,
    quality_grade: "B",
    quality_score: 79,
    flagged: false,
    archived: false,
    content_summary:
      "Growth-focused résumé built around onboarding, activation, and experimentation, with a concise one-page layout.",
    active_version: 1,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-09-02T09:45:00.000Z", content: resume104V1 },
    ],
  },
  {
    id: 105,
    original_filename: "Jordan-Reyes-2024-Archive.pdf",
    target_role: "Senior UX Designer",
    source: "uploaded",
    template_id: "classic",
    created_at: "2026-06-14T11:00:00.000Z",
    updated_at: "2026-06-14T11:00:00.000Z",
    rendered_text: resume105V1,
    quality_grade: "C",
    quality_score: 66,
    flagged: false,
    archived: true,
    archived_at: "2026-08-30T09:10:00.000Z",
    content_summary:
      "An older one-page résumé kept for reference. Archived, but still opens and edits normally.",
    active_version: 1,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-06-14T11:00:00.000Z", content: resume105V1 },
    ],
  },
];

export const mockDocumentsCoverLetters = [
  {
    id: 201,
    content:
      "Dear Hiring Team,\n\nI'm applying for the Senior Product Designer role at Northwind Analytics, where your focus on design systems at scale lines up directly with the last four years of my work. As lead designer for a platform team, I built a 120-component design system adopted by six product teams — and cut new-screen build time by 38% in the process.\n\nWhat draws me to Northwind specifically is the analytics workspace itself. I redesigned a comparable dashboard for 40k+ customers and lifted weekly active usage of saved reports by 27%, so I know the levers that make dense data products feel approachable.\n\nBeyond the craft, I bring a research habit — running a quarterly cadence that fed 20+ validated improvements into the roadmap — and a track record of partnering closely with engineering. I'd be glad to walk through how that experience maps to your roadmap.\n\nThanks for your time and consideration.\n\nJordan Reyes",
    source: "generated",
    job_posting_id: 1,
    resume_id: 101,
    tone: "Professional",
    template_id: "modern",
    created_at: "2026-09-25T10:00:00.000Z",
    quality_grade: "A",
    quality_score: 90,
    flagged: false,
    archived: false,
    active_version: 1,
    versions: [
      { version: 1, label: "Generated for Senior Product Designer", source: "generated", job_title: "Senior Product Designer", created_at: "2026-09-25T10:00:00.000Z" },
    ],
  },
  {
    id: 202,
    content:
      "Dear Marcus,\n\nI've followed Linear's approach to craft for years, and the Staff Product Designer role feels like a natural next step. In my current role I own the design system and the analytics workspace end to end, shipping a token-driven library that six teams now build on.\n\nI'm drawn to how tightly your team pairs design and engineering. I've worked in that model myself — writing the tokens, reviewing the components, and iterating in the browser alongside engineers — and it's where I do my best work.\n\nI'd love to talk about where Linear is heading and how I can help.\n\nWarm regards,\nJordan Reyes",
    source: "generated",
    job_posting_id: 2,
    resume_id: 102,
    tone: "Enthusiastic",
    template_id: "minimal",
    created_at: "2026-09-20T15:30:00.000Z",
    quality_grade: "B",
    quality_score: 83,
    flagged: false,
    archived: false,
    active_version: 1,
    versions: [
      { version: 1, label: "Generated for Staff Product Designer", source: "generated", job_title: "Staff Product Designer", created_at: "2026-09-20T15:30:00.000Z" },
    ],
  },
  {
    id: 203,
    content: "Dear Hiring Team,\n\nPlease accept this letter as my application for the Design Lead, Payments role at Ramp.\n\nAcross eight years in product design I've moved from craft into leadership — running design reviews, coaching two mid-level designers, and setting the direction for a payments-adjacent dashboard used by thousands of finance teams.\n\nI'd welcome the chance to discuss how I can help Ramp keep raising the bar.\n\nSincerely,\nJordan Reyes",
    source: "uploaded",
    original_filename: "Cover-Letter-Ramp.pdf",
    resume_id: 103,
    tone: "Direct",
    template_id: "classic",
    created_at: "2026-09-15T12:10:00.000Z",
    quality_grade: "B",
    quality_score: 81,
    flagged: true,
    archived: false,
    active_version: 1,
    versions: [
      { version: 1, label: "Original upload", source: "uploaded", created_at: "2026-09-15T12:10:00.000Z" },
    ],
  },
  {
    id: 204,
    content:
      "Dear Hiring Team,\n\nI'm excited to apply for the Product Designer, Growth role. Growth design is where craft, data, and speed meet, and I've spent the last three years living in that space.\n\nAt Lumen Labs I redesigned onboarding and lifted activation from 41% to 58% over two quarters, and I ran an experiment program that shipped 30+ tests with a shared measurement standard.\n\nI'd love to bring that same rigour to your team.\n\nBest regards,\nJordan Reyes",
    source: "generated",
    job_posting_id: 4,
    resume_id: 104,
    tone: "Friendly",
    template_id: "banner",
    created_at: "2026-09-05T09:00:00.000Z",
    quality_grade: "C",
    quality_score: 68,
    flagged: false,
    archived: true,
    archived_at: "2026-09-28T10:20:00.000Z",
    active_version: 1,
    versions: [
      { version: 1, label: "Generated for Product Designer, Growth", source: "generated", job_title: "Product Designer, Growth", created_at: "2026-09-05T09:00:00.000Z" },
    ],
  },
];

export const mockDocumentReview = {
  score: 88,
  grade: "A",
  summary:
    "A polished, well-structured document with clear impact statements and consistent formatting. Strong verbs lead most bullets and the scope is easy to scan. The main opportunity is tightening a few older roles and adding one more quantified outcome to the most recent position.",
  content_summary:
    "Experienced product designer with a systems and outcomes focus, spanning design systems, analytics dashboards, and growth surfaces.",
  strengths: [
    "Impact-led bullets with concrete, quantified results",
    "Clear seniority signals and consistent formatting",
    "Relevant, modern tooling and design-system depth",
  ],
  suggestions: [
    { category: "Impact", severity: "important", title: "Quantify the most recent role further", detail: "Two bullets in the current role describe scope without a measurable outcome. Add a number (time saved, adoption, revenue) to make the impact concrete." },
    { category: "Clarity", severity: "suggestion", title: "Trim the earliest role", detail: "The first role lists five bullets; consider keeping the two strongest to keep the whole document scannable." },
    { category: "Keywords", severity: "suggestion", title: "Mirror a few target-role keywords", detail: "The job posting emphasizes 'design systems' and 'experimentation' — both are present but could be surfaced earlier." },
  ],
  ratings: [
    { standard: "Impact & results", score: 90, grade: "A" },
    { standard: "Clarity & structure", score: 88, grade: "A" },
    { standard: "Keyword coverage", score: 82, grade: "B" },
  ],
  word_count: 612,
  missing_keywords: ["cross-functional", "roadmap ownership"],
};