import type { ReactNode } from "react";

export type BadgeTone = "primary" | "accent" | "secondary" | "foreground";
export type BadgeVariant = "soft" | "outline" | "solid";
export type BadgeSize = "sm" | "md";

const SOFT: Record<BadgeTone, string> = {
  primary: "bg-primary-100 text-primary-900",
  accent: "bg-accent-100 text-accent-900",
  secondary: "bg-secondary-100 text-secondary-900",
  foreground: "bg-foreground-100 text-foreground-800",
};

const SOLID: Record<BadgeTone, string> = {
  primary: "bg-primary-500 text-background-50 dark:text-foreground-950",
  accent: "bg-accent-500 text-background-50 dark:text-foreground-950",
  secondary: "bg-secondary-500 text-background-50 dark:text-foreground-950",
  foreground: "bg-foreground-900 text-background-50 dark:text-foreground-950",
};

const OUTLINE: Record<BadgeTone, string> = {
  primary: "border border-primary-300 text-primary-700",
  accent: "border border-accent-300 text-accent-700",
  secondary: "border border-secondary-300 text-secondary-700",
  foreground: "border border-background-300 text-foreground-700",
};

const DOT: Record<BadgeTone, string> = {
  primary: "bg-primary-500",
  accent: "bg-accent-500",
  secondary: "bg-secondary-500",
  foreground: "bg-foreground-500",
};

const SIZE: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-[11px] px-2 py-0.5 gap-1",
};

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Leading Remix Icon class, e.g. "ri-timer-line". */
  icon?: string;
  /** Render a small leading status dot instead of an icon. */
  dot?: boolean;
  className?: string;
}

/**
 * The design system's chip/badge primitive. Soft tone tints are the default
 * (matching the trend chip on the canonical stat cards); `solid` is reserved
 * for the strongest emphasis and always pairs with a background-50 label.
 */
export default function Badge({
  children,
  tone = "primary",
  variant = "soft",
  size = "md",
  icon,
  dot = false,
  className = "",
}: BadgeProps) {
  const variantCls =
    variant === "solid" ? SOLID[tone] : variant === "outline" ? OUTLINE[tone] : SOFT[tone];

  const cls = [
    "inline-flex items-center font-semibold rounded-full whitespace-nowrap",
    variantCls,
    SIZE[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[tone]}`} aria-hidden="true"></span>
      )}
      {!dot && icon && <i className={icon} aria-hidden="true"></i>}
      {children}
    </span>
  );
}