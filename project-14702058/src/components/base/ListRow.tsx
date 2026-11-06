import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ListRowProps {
  /** Title line (usually the item's name). */
  title?: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Quiet metadata line under the subtitle. */
  meta?: ReactNode;
  /** Leading slot — an avatar, icon tile, or rank badge. */
  leading?: ReactNode;
  /** Trailing slot — badges, buttons, or an overflow menu. */
  trailing?: ReactNode;
  /** Full replacement for the middle content (overrides title/subtitle/meta). */
  children?: ReactNode;
  /**
   * CSS color for the left "quality spine" bar (an oklch() string). Omit for a
   * plain row. This is the same spine treatment the ranked matches list uses.
   */
  spine?: string;
  interactive?: boolean;
  to?: string;
  href?: string;
  className?: string;
}

/**
 * The design system's list-row primitive — the horizontal unit used by the
 * ranked matches, saved jobs, search results and every other list. It carries
 * the optional colored quality spine, a leading slot, a content column and a
 * trailing action slot, all on the same bordered rounded surface as a card.
 */
export default function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  children,
  spine,
  interactive = false,
  to,
  href,
  className = "",
}: ListRowProps) {
  const cls = [
    "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-background-200 bg-background-50 pl-4 pr-4 py-3.5",
    interactive ? "hw-lift hover:border-primary-300 cursor-pointer" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {spine && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ background: spine }}
        ></span>
      )}
      {leading}
      <div className="relative z-10 min-w-0 flex-1">
        {children ?? (
          <>
            {title && (
              <div className="text-sm font-semibold text-foreground-950 truncate">{title}</div>
            )}
            {subtitle && (
              <div className="text-xs text-foreground-600 truncate mt-0.5">{subtitle}</div>
            )}
            {meta && <div className="text-xs text-foreground-500 truncate mt-0.5">{meta}</div>}
          </>
        )}
      </div>
      {trailing}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}