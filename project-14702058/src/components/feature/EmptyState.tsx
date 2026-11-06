import type { ReactNode } from "react";

type EmptyTone = "primary" | "accent" | "secondary";

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyTone;
  className?: string;
}

const TONE = {
  primary: {
    halo: "bg-primary-100/60",
    inner: "bg-primary-200/50",
    tile: "bg-background-50 text-primary-700",
    dot: "bg-primary-400",
    ring: "ring-primary-200/70",
  },
  accent: {
    halo: "bg-accent-100/60",
    inner: "bg-accent-200/50",
    tile: "bg-background-50 text-accent-700",
    dot: "bg-accent-400",
    ring: "ring-accent-200/70",
  },
  secondary: {
    halo: "bg-secondary-100/60",
    inner: "bg-secondary-200/50",
    tile: "bg-background-50 text-secondary-700",
    dot: "bg-secondary-400",
    ring: "ring-secondary-200/70",
  },
} as const;

/**
 * A light, illustration-style empty state — layered soft token shapes framing a
 * remix icon, with an optional action. Shared across Matches, Applications,
 * Search and saved lists so every empty surface feels designed, not blank.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "primary",
  className = "",
}: EmptyStateProps) {
  const t = TONE[tone];

  return (
    <div className={`animate-rise py-14 px-6 text-center ${className}`}>
      <div className="relative w-24 h-24 mx-auto" aria-hidden="true">
        <span className={`absolute inset-0 rounded-full ${t.halo}`}></span>
        <span className={`absolute inset-3 rounded-full ${t.inner}`}></span>
        <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${t.dot}`}></span>
        <span className={`absolute bottom-2 left-0 w-2 h-2 rounded-full ${t.dot} opacity-70`}></span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ring-4 ${t.tile} ${t.ring}`}
          >
            <i className={`${icon} text-2xl`}></i>
          </span>
        </span>
      </div>
      <p className="mt-5 text-sm font-semibold text-foreground-900">{title}</p>
      {description && (
        <p className="mt-1.5 text-xs text-foreground-500 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex items-center justify-center gap-2">{action}</div>}
    </div>
  );
}