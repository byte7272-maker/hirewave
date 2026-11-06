import { useState } from "react";

interface CompanyAvatarProps {
  company?: string;
  logo?: string;
  size?: number;
  className?: string;
}

// Logo-style gradient tiles — token-based so they repaint with the palette.
const TILE_STYLES = [
  "bg-gradient-to-br from-primary-500 to-primary-700 text-background-50 dark:text-foreground-950",
  "bg-gradient-to-br from-accent-500 to-accent-700 text-background-50 dark:text-foreground-950",
  "bg-gradient-to-br from-secondary-500 to-secondary-700 text-background-50 dark:text-foreground-950",
  "bg-gradient-to-br from-primary-600 to-primary-800 text-background-50 dark:text-foreground-950",
  "bg-gradient-to-br from-accent-600 to-accent-800 text-background-50 dark:text-foreground-950",
  "bg-gradient-to-br from-secondary-600 to-secondary-800 text-background-50 dark:text-foreground-950",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(company?: string): string {
  const name = (company || "").trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * A company mark rendered as a rounded "logo block" — the initials sit on a
 * name-hashed gradient tile with a soft gloss, so it reads like a real app
 * logo rather than a flat letter circle. Falls back gracefully when a real
 * logo image fails to load.
 */
export default function CompanyAvatar({
  company,
  logo,
  size = 40,
  className = "",
}: CompanyAvatarProps) {
  const [failed, setFailed] = useState(false);

  const dimension = { width: size, height: size };
  const radius = Math.max(8, Math.round(size * 0.28));

  if (logo && !failed) {
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden bg-background-100 border border-background-300/60 flex-shrink-0 ${className}`}
        style={{ ...dimension, borderRadius: radius }}
      >
        <img
          src={logo}
          alt={company || "Company"}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const tile = TILE_STYLES[hashString(company || "") % TILE_STYLES.length];

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden font-heading font-semibold flex-shrink-0 ${tile} ${className}`}
      style={{ ...dimension, borderRadius: radius, fontSize: Math.round(size * 0.42) }}
      aria-label={company || "Company"}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-50/30 to-transparent"
        aria-hidden="true"
      ></span>
      <span className="relative leading-none">{initials(company)}</span>
    </span>
  );
}