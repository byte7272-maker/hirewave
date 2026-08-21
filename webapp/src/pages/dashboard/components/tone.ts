export type Tone = "primary" | "accent" | "secondary" | "foreground" | "background";

export const toneIconBg: Record<Tone, string> = {
  primary: "bg-primary-500 text-background-50 dark:text-foreground-950",
  accent: "bg-accent-500 text-background-50 dark:text-foreground-950",
  secondary: "bg-secondary-500 text-background-50 dark:text-foreground-950",
  foreground: "bg-foreground-950 text-background-50",
  background: "bg-background-200 text-foreground-700",
};

export const toneBadge: Record<Tone, string> = {
  primary: "bg-primary-100 text-primary-900",
  accent: "bg-accent-100 text-accent-900",
  secondary: "bg-secondary-100 text-secondary-900",
  foreground: "bg-foreground-100 text-foreground-800",
  background: "bg-background-200 text-foreground-700",
};

export const toneBar: Record<Tone, string> = {
  primary: "bg-primary-400",
  accent: "bg-accent-400",
  secondary: "bg-secondary-400",
  foreground: "bg-foreground-400",
  background: "bg-background-400",
};

export const toneDot: Record<Tone, string> = {
  primary: "bg-primary-500",
  accent: "bg-accent-500",
  secondary: "bg-secondary-500",
  foreground: "bg-foreground-700",
  background: "bg-background-400",
};