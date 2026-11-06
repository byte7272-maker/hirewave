/**
 * Thin re-export so every grouped dashboard widget shares the ONE canonical
 * section header in the design system. Do not add logic here — edit
 * `@/components/base/SectionHeader`.
 */
export { default } from "@/components/base/SectionHeader";
export type {
  SectionHeaderProps as PanelHeaderProps,
  SectionHeaderTone as PanelTone,
} from "@/components/base/SectionHeader";