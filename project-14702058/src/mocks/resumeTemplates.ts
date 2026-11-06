/**
 * Static fallback catalog for the in-editor Design chooser, used while the
 * template service (`GET /api/v1/resume-templates`) isn't connected.
 *
 * Each entry mirrors the API item shape: a layout id plus its full style —
 * accent color, font family (sans / serif / mono) and heading treatment
 * (underline / bar / plain / caps). The id matches a layout in the theme
 * registry, so the same data can be rendered into every design locally.
 */
export const resumeTemplatesMock = [
  {
    id: "modern",
    name: "Modern",
    description: "Single column with an accent rule and clean section headings",
    category: "Single column",
    paper: "#ffffff",
    style: { accent_color: "cobalt", font_family: "sans", heading_style: "underline" },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Airy and quiet — small labels, everything left-aligned",
    category: "Single column",
    paper: "#ffffff",
    style: { accent_color: "graphite", font_family: "sans", heading_style: "plain" },
  },
  {
    id: "sidebar",
    name: "Sidebar",
    description: "Tinted left rail for contact and skills, roomy main column",
    category: "Two column",
    paper: "#ffffff",
    style: { accent_color: "teal", font_family: "sans", heading_style: "bar" },
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "A date gutter and accent rail tracing your career",
    category: "Two column",
    paper: "#ffffff",
    style: { accent_color: "amber", font_family: "sans", heading_style: "bar" },
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional serif, centered header, ruled section dividers",
    category: "Traditional",
    paper: "#ffffff",
    style: { accent_color: "graphite", font_family: "serif", heading_style: "caps" },
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Refined serif with a letterspaced name and ornament rules",
    category: "Traditional",
    paper: "#ffffff",
    style: { accent_color: "rose", font_family: "serif", heading_style: "caps" },
  },
];