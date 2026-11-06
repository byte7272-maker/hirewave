import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type ButtonVariant =
  | "solid"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "subtle";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  solid:
    "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600",
  accent:
    "bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600",
  secondary:
    "bg-secondary-500 text-background-50 dark:text-foreground-950 hover:bg-secondary-600",
  outline:
    "border border-background-300 text-foreground-800 hover:bg-background-100 hover:border-primary-300",
  ghost: "text-foreground-700 hover:bg-background-100 hover:text-foreground-950",
  subtle: "bg-background-200/70 text-foreground-800 hover:bg-background-300",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 rounded-md",
  md: "text-sm px-4 py-2.5 gap-2 rounded-md",
  lg: "text-base px-5 py-3 gap-2 rounded-lg",
};

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading Remix Icon class, e.g. "ri-add-line". */
  icon?: string;
  /** Trailing Remix Icon class. */
  trailingIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Internal route — renders a `<Link>`. */
  to?: string;
  /** External URL — renders an `<a>` opening in a new tab. */
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * The design system's button primitive. One implementation of every actionable
 * control — solid primary, accent, secondary, outline, ghost and subtle — so
 * buttons read as the same family everywhere. Solid tones pair with a
 * background-50 label (dark:text-foreground-950 in dark mode) at WCAG AA.
 */
export default function Button({
  children,
  variant = "solid",
  size = "md",
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  to,
  href,
  type = "button",
  onClick,
  className = "",
  "aria-label": ariaLabel,
}: ButtonProps) {
  const cls = [
    "inline-flex items-center justify-center font-semibold whitespace-nowrap cursor-pointer transition-colors",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {loading ? (
        <i className="ri-loader-4-line animate-spin" aria-hidden="true"></i>
      ) : (
        icon && <i className={`${icon} text-[1.05em]`} aria-hidden="true"></i>
      )}
      {children}
      {trailingIcon && (
        <i className={`${trailingIcon} text-[1.05em]`} aria-hidden="true"></i>
      )}
    </>
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        aria-label={ariaLabel}
      >
        {body}
      </a>
    );
  }

  if (to && !disabled) {
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cls}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
    >
      {body}
    </button>
  );
}