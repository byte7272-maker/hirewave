import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
  /** Extra classes to blend the control into its surrounding chrome. */
  className?: string;
}

/**
 * A single icon button that flips the whole app between the light and dark
 * palettes. The glyph swaps and the room animates in place, so the change of
 * state is obvious without any label.
 */
export default function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-md text-foreground-600 hover:bg-background-100 hover:text-foreground-950 cursor-pointer overflow-hidden ${className}`}
    >
      <i
        className={`${
          dark ? "ri-sun-line" : "ri-moon-line"
        } text-lg animate-fade-in-up`}
        key={theme}
      ></i>
    </button>
  );
}