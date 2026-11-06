import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

export type CardTone = "none" | "primary" | "accent" | "secondary";
export type CardSurface = "plain" | "tinted";

const GLOW: Record<CardTone, string> = {
  none: "",
  primary: "bg-primary-200/50",
  accent: "bg-accent-200/50",
  secondary: "bg-secondary-200/50",
};

const SURFACE: Record<CardSurface, string> = {
  plain: "bg-background-50",
  tinted: "bg-background-100/60",
};

/** Hover border for an interactive card — matched to the card's own tone. */
const HOVER_BORDER: Record<CardTone, string> = {
  none: "hover:border-primary-300",
  primary: "hover:border-primary-300",
  accent: "hover:border-accent-300",
  secondary: "hover:border-secondary-300",
};

export interface CardProps {
  children: ReactNode;
  /** Tint of the soft top-right glow blob. `none` renders no glow. */
  tone?: CardTone;
  /** `plain` = background-50 surface, `tinted` = background-100/60 surface. */
  surface?: CardSurface;
  /** Adds the `.hw-lift` hover, a primary border on hover, and a pointer. */
  interactive?: boolean;
  /** Apply the canonical 20px card padding. */
  padded?: boolean;
  /** Clip overflowing children (contains the glow). Set false when the card
   * hosts a dropdown/menu that must escape its bounds. */
  clip?: boolean;
  /** CSS color for the left "quality spine" bar (an oklch() string). Omit for a
   * plain card. This is the same spine treatment the ranked lists use. */
  spine?: string;
  /** Internal route — renders the card as a `<Link>`. */
  to?: string;
  /** External URL — renders the card as an `<a>` opening in a new tab. */
  href?: string;
  className?: string;
  style?: CSSProperties;
  /** Optional DOM id (e.g. an in-page anchor target). */
  id?: string;
  "aria-label"?: string;
}

/**
 * The design system's surface primitive. It reproduces the EXACT anatomy of the
 * two canonical dashboard stat cards: a rounded-2xl, hairline-bordered,
 * shadow-free panel in background-50 with one soft tone glow in the top-right
 * corner and the content lifted onto a `relative z-10` layer. Every card-like
 * surface in the app should build on this so the material never drifts.
 */
export default function Card({
  children,
  tone = "none",
  surface = "plain",
  interactive = false,
  padded = false,
  clip = true,
  spine,
  to,
  href,
  className = "",
  style,
  id,
  "aria-label": ariaLabel,
}: CardProps) {
  const cls = [
    "group relative rounded-card border border-background-200",
    clip ? "overflow-hidden" : "",
    SURFACE[surface],
    padded ? "p-5" : "",
    interactive ? "hw-lift " + HOVER_BORDER[tone] + " cursor-pointer" : "",
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
      {tone !== "none" && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-8 -top-10 w-32 h-32 rounded-full blur-3xl opacity-70 ${GLOW[tone]}`}
        ></span>
      )}
      <div className="relative z-10">{children}</div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        style={style}
        id={id}
        aria-label={ariaLabel}
      >
        {inner}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={cls} style={style} id={id} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cls} style={style} id={id} aria-label={ariaLabel}>
      {inner}
    </div>
  );
}