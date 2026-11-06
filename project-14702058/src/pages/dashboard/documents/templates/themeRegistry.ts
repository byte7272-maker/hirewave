import type { ComponentType, ReactNode } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import type { FlaggedMetric } from "@/lib/documents";
import type { AccentColor } from "./accent";
import type { RenderBullet } from "./bulletRender";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import TemplateModern from "./themes/TemplateModern";
import TemplateMinimal from "./themes/TemplateMinimal";
import TemplateSidebar from "./themes/TemplateSidebar";
import TemplateTimeline from "./themes/TemplateTimeline";
import TemplateClassic from "./themes/TemplateClassic";
import TemplateElegant from "./themes/TemplateElegant";

export interface ResumeTheme {
  id: string;
  name: string;
  description: string;
  /** Layout family, used to group/filter the chooser. */
  category: string;
  /** Paper color used for the picker thumbnail. */
  paper: string;
  Component: ComponentType<{
    resume: JsonResume;
    accent?: AccentColor;
    /** Figures the AI added — highlighted inline at their field location. */
    flags?: FlaggedMetric[];
    /**
     * When provided, each section shows a hover "Improve" affordance that fires
     * a focused field-level improve. Omitted in read-only contexts.
     */
    onImproveSection?: (instruction: string, label: string) => void;
    /**
     * When provided, each Experience/role entry renders the returned node beneath
     * its bullets (used for the verbatim "+ Add bullet" affordance). Omitted in
     * read-only contexts.
     */
    renderRoleActions?: (workIndex: number) => ReactNode;
    /**
     * When provided, each project entry renders the returned node beneath its
     * bullets (the project "+ Add highlight" affordance).
     */
    renderProjectActions?: (projectIndex: number) => ReactNode;
    /**
     * When provided, the certifications section renders the returned node (the
     * "Add certification" affordance).
     */
    renderCertificateActions?: () => ReactNode;
    /**
     * When provided, each bullet in the Experience/Project lists is rendered
     * through this — enabling inline edit / remove / polish on existing bullets.
     */
    renderBullet?: RenderBullet;
    /**
     * How the Skills section is presented — one comma-separated line or a
     * bulleted list. A pure display choice; defaults to the comma list.
     */
    skillsLayout?: SkillsLayout;
  }>;
}

export const RESUME_THEMES: ResumeTheme[] = [
  {
    id: "modern",
    name: "Modern",
    description: "Single column, accent rule, skill pills",
    category: "Single column",
    paper: "#ffffff",
    Component: TemplateModern,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Airy, quiet labels, left-aligned",
    category: "Single column",
    paper: "#ffffff",
    Component: TemplateMinimal,
  },
  {
    id: "sidebar",
    name: "Sidebar",
    description: "Tinted left rail for contact + skills, roomy main column",
    category: "Two column",
    paper: "#ffffff",
    Component: TemplateSidebar,
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Date gutter and accent rail tracing your career",
    category: "Two column",
    paper: "#ffffff",
    Component: TemplateTimeline,
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional serif, centered, ruled sections",
    category: "Traditional",
    paper: "#ffffff",
    Component: TemplateClassic,
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Refined serif, letterspaced name, ornament rules",
    category: "Traditional",
    paper: "#ffffff",
    Component: TemplateElegant,
  },
];

export const DEFAULT_THEME_ID = "modern";

export function getTheme(id: string): ResumeTheme {
  return RESUME_THEMES.find((t) => t.id === id) ?? RESUME_THEMES[0];
}