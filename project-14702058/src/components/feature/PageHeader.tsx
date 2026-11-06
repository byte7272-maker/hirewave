import { useEffect, useState, type ReactNode } from "react";

type Tone = "primary" | "accent" | "secondary";

const TONE_STYLES: Record<Tone, { tile: string; glow: string; bar: string }> = {
  primary: {
    tile: "bg-primary-100 text-primary-700",
    glow: "bg-primary-200/50",
    bar: "bg-primary-500",
  },
  accent: {
    tile: "bg-accent-100 text-accent-700",
    glow: "bg-accent-200/50",
    bar: "bg-accent-500",
  },
  secondary: {
    tile: "bg-secondary-100 text-secondary-700",
    glow: "bg-secondary-200/50",
    bar: "bg-secondary-500",
  },
};

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Remix Icon class, rendered inside the accent tile. */
  icon?: string;
  tone?: Tone;
  /** Right-aligned actions (buttons, pills, links). */
  actions?: ReactNode;
  className?: string;
  /** Optional photographic backdrop. Falls back to the plain style if it can't load. */
  image?: string;
  imageAlt?: string;
}

/**
 * Shared section header for internal pages. Gives every page the same designed
 * opening — an accent tile, a soft token-based glow and a coloured spine — or a
 * photographic backdrop when an image is supplied. Each page keeps its own actions.
 */
export default function PageHeader({
  title,
  subtitle,
  icon,
  tone = "primary",
  actions,
  className = "",
  image,
  imageAlt,
}: PageHeaderProps) {
  const s = TONE_STYLES[tone];
  const [imgOk, setImgOk] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const hasPhoto = Boolean(image) && imgOk;

  // A new backdrop starts a fresh retry cycle.
  useEffect(() => {
    setImgOk(true);
    setAttempt(0);
  }, [image]);

  // Retry a failed load a couple of times (cache-busted) before giving up.
  const imgSrc =
    image && attempt > 0
      ? `${image}${image.includes("?") ? "&" : "?"}_r=${attempt + 1}`
      : image;

  return (
    <section
      className={`animate-fade-in-up relative overflow-hidden rounded-2xl border ${
        hasPhoto
          ? "border-foreground-950/10 min-h-[180px]"
          : "border-background-200 bg-background-100/60"
      } ${className}`}
    >
      {hasPhoto ? (
        <>
          <img
            src={imgSrc}
            alt={imageAlt ?? ""}
            title={imageAlt ?? title}
            onError={() => {
              if (attempt < 2) setAttempt((a) => a + 1);
              else setImgOk(false);
            }}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Mode-agnostic dark scrim — never `foreground-950`, which flips to a
              near-white veil in dark mode and would wash the header out. */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/35"></div>
        </>
      ) : (
        <>
          <span
            className={`pointer-events-none absolute -right-10 -top-16 w-52 h-52 rounded-full blur-3xl ${s.glow}`}
          ></span>
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-40 hw-dotgrid opacity-70 [mask-image:linear-gradient(to_left,black,transparent)]"
            aria-hidden="true"
          ></span>
          <span
            className={`pointer-events-none absolute left-0 top-0 h-full w-1 ${s.bar}`}
          ></span>
        </>
      )}

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 md:p-7">
        <div className="flex items-center gap-4 min-w-0">
          {icon && (
            <span
              className={`w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-2xl flex-shrink-0 ${
                hasPhoto
                  ? "bg-background-50/15 text-background-50 border border-background-50/25 backdrop-blur-sm dark:bg-foreground-950/15 dark:text-foreground-950 dark:border-foreground-950/25"
                  : s.tile
              }`}
            >
              <i className={`${icon} text-2xl`}></i>
            </span>
          )}
          <div className="min-w-0">
            <h1
              className={`font-heading text-2xl md:text-3xl font-medium tracking-tight ${
                hasPhoto ? "text-background-50 dark:text-foreground-950" : "text-foreground-950"
              }`}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={`text-sm mt-1.5 ${
                  hasPhoto
                    ? "text-background-100/90 dark:text-foreground-900/90"
                    : "text-foreground-600"
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </section>
  );
}