import type { ComponentType } from "react";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "./accent";
import CoverLetterModern from "./coverletter/CoverLetterModern";
import CoverLetterMinimal from "./coverletter/CoverLetterMinimal";
import CoverLetterSidebar from "./coverletter/CoverLetterSidebar";
import CoverLetterBanner from "./coverletter/CoverLetterBanner";
import CoverLetterClassic from "./coverletter/CoverLetterClassic";
import CoverLetterElegant from "./coverletter/CoverLetterElegant";

export interface CoverLetterTheme {
  id: string;
  name: string;
  description: string;
  /** Layout family, used to group/filter the chooser. */
  category: string;
  /** Paper color used for the picker thumbnail. */
  paper: string;
  Component: ComponentType<{
    data: CoverLetterStructured;
    accent?: AccentColor;
    /**
     * When provided, each section shows a hover "Improve" affordance that fires
     * a focused field-level improve. Omitted in read-only contexts.
     */
    onImproveSection?: (instruction: string, label: string) => void;
  }>;
}

export const COVER_LETTER_THEMES: CoverLetterTheme[] = [
  {
    id: "modern",
    name: "Modern",
    description: "Sans-serif header, accent rule, clean meta block",
    category: "Single column",
    paper: "#ffffff",
    Component: CoverLetterModern,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Airy, quiet accent label, left-aligned",
    category: "Single column",
    paper: "#ffffff",
    Component: CoverLetterMinimal,
  },
  {
    id: "sidebar",
    name: "Sidebar",
    description: "Tinted identity rail beside the letter body",
    category: "Two column",
    paper: "#ffffff",
    Component: CoverLetterSidebar,
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional serif, centered header, ruled",
    category: "Traditional",
    paper: "#ffffff",
    Component: CoverLetterClassic,
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Refined serif, letterspaced name, ornament rule",
    category: "Traditional",
    paper: "#ffffff",
    Component: CoverLetterElegant,
  },
  {
    id: "banner",
    name: "Banner",
    description: "Full-width accent band header over an open body",
    category: "Banner",
    paper: "#ffffff",
    Component: CoverLetterBanner,
  },
];

export const DEFAULT_COVER_LETTER_THEME_ID = "modern";

export function getCoverLetterTheme(id: string): CoverLetterTheme {
  return (
    COVER_LETTER_THEMES.find((t) => t.id === id) ?? COVER_LETTER_THEMES[0]
  );
}