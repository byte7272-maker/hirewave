import type { ReactNode } from "react";

export type SectionHeaderTone = "primary" | "accent" | "secondary" | "foreground";
export type SectionHeaderVariant = "panel" | "plain";

const TILE: Record<SectionHeaderTone, string> = {
  primary: "bg-primary-100 text-primary-700",
  accent: "bg-accent-100 text-accent-700",
  secondary: "bg-secondary-100 text-secondary-700",
  foreground: "bg-background-200 text-foreground-700",
};

export interface SectionHeaderProps {
  /** Remix Icon class, e.g. "ri-focus-3-line". */
  icon: string;
  title: string;
  subtitle?: string;
  /** Color of the leading icon tile. */
  tone?: SectionHeaderTone;
  /** Optional pill count shown before the action slot. */
  count?: number | string;
  countLabel?: string;
  /** Trailing slot — a link, toggle, button, or menu. */
  action?: ReactNode;
  /** `panel` draws the bottom hairline (card headers); `plain` omits it. */
  variant?: SectionHeaderVariant;
  className?: string;
}

/**
 * The design system's section/panel header. One header treatment — a rounded
 * icon tile, a title with an optional subtitle, an optional count pill and a
 * trailing action slot — used by every grouped panel in the app, so new widgets
 * instantly read as part of the same surface family.
 */
export default function SectionHeader({
  icon,
  title,
  subtitle,
  tone = "primary",
  count,
  countLabel,
  action,
  variant = "panel",
  className = "",
}: SectionHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-5 py-4 ${
        variant === "panel" ? "border-b border-background-200" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`hw-tile rounded-tile ${TILE[tone]}`}>
          <i className={`${icon} text-lg`} aria-hidden="true"></i>
        </div>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-medium text-foreground-950 truncate">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-foreground-500 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {count !== undefined && count !== null && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-700 bg-background-200/70 px-2.5 py-1 rounded-full whitespace-nowrap">
            {count}
            {countLabel ? ` ${countLabel}` : ""}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}