/**
 * The Harbor design system — shared surface primitives.
 *
 * Every card, stat, chip, header, button and list row in the app composes from
 * these, so the whole product reads as one material. See `src/design-system.md`
 * for the full token + component reference.
 */
export { default as Card } from "@/components/base/Card";
export type { CardProps, CardTone, CardSurface } from "@/components/base/Card";

export { default as StatCard } from "@/components/base/StatCard";
export type { StatCardProps, StatTone } from "@/components/base/StatCard";

export { default as SectionHeader } from "@/components/base/SectionHeader";
export type {
  SectionHeaderProps,
  SectionHeaderTone,
  SectionHeaderVariant,
} from "@/components/base/SectionHeader";

export { default as Badge } from "@/components/base/Badge";
export type { BadgeProps, BadgeTone, BadgeVariant, BadgeSize } from "@/components/base/Badge";

export { default as Button } from "@/components/base/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "@/components/base/Button";

export { default as ListRow } from "@/components/base/ListRow";
export type { ListRowProps } from "@/components/base/ListRow";

// Shared states — empty / loading / error all live together so any surface can
// render a designed state from one import.
export { default as EmptyState } from "@/components/feature/EmptyState";
export { default as LoadingState } from "@/components/base/LoadingState";
export type { LoadingStateProps } from "@/components/base/LoadingState";
export { default as ErrorState } from "@/components/base/ErrorState";
export type { ErrorStateProps, ErrorStateTone } from "@/components/base/ErrorState";

// Form controls — the canonical field + select treatment.
export { TextField, SelectField } from "@/components/base/Field";
export type { TextFieldProps, SelectFieldProps } from "@/components/base/Field";