import { useEffect, useState } from "react";

/** Which zone is "done" — driven by the workspace's live state. */
export interface ZoneNavStatus {
  /** The user has copied a prompt (the first zone's only real attention signal). */
  prompts: boolean;
  /** There is text in the paste box. */
  paste: boolean;
  /** At least one fact is ticked and ready to add. */
  review: boolean;
}

interface HighlightsZoneNavProps {
  status: ZoneNavStatus;
}

/** The three always-visible zones, in reading order, with their section ids. */
const ZONES = [
  { id: "my-work-highlights-prompts", key: "prompts", label: "Prompts", icon: "ri-magic-line" },
  { id: "my-work-highlights-paste", key: "paste", label: "Paste", icon: "ri-clipboard-line" },
  { id: "my-work-highlights-review", key: "review", label: "Review", icon: "ri-check-double-line" },
] as const;

/**
 * A slim, sticky in-page nav for the long three-zone workspace
 * (Prompts · Paste · Review). Each chip scrolls straight to its zone, and the
 * chip for whichever zone is currently in view stays highlighted, so the page
 * stays skimmable instead of feeling like one endless scroll.
 *
 * Each chip also carries a subtle progress dot: filled once that zone has
 * content (a prompt copied, text pasted, facts selected), hollow while it still
 * needs attention — so the user can see at a glance which stop is outstanding.
 *
 * It parks just under the dashboard topbar (64px) and sits below it in the stack
 * (z-20 vs the topbar's z-30) so the two never collide.
 */
export default function HighlightsZoneNav({ status }: HighlightsZoneNavProps) {
  const [active, setActive] = useState<string>(ZONES[0].id);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The zone whose top has most recently crossed a line a bit below the nav
      // is the one we consider "active".
      const marker = 160;
      let current: string = ZONES[0].id;
      for (const z of ZONES) {
        const el = document.getElementById(z.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) current = z.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label="Workspace sections"
      className="sticky top-16 z-20 py-2 bg-background-50/90 backdrop-blur-sm"
    >
      <div className="inline-flex items-center gap-1 rounded-full border border-background-200 bg-background-50 p-1">
        {ZONES.map((z) => {
          const isActive = active === z.id;
          const done = status[z.key];
          // Subtle dot: filled = has content, hollow = still needs attention.
          // On the active (primary-filled) chip the dot flips to a light tone so
          // it stays visible against the solid background.
          const dotClass = done
            ? isActive
              ? "bg-background-50"
              : "bg-primary-500"
            : isActive
              ? "border border-background-50/70"
              : "border border-foreground-300";
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => go(z.id)}
              aria-current={isActive ? "true" : undefined}
              title={done ? `${z.label} — has content` : `${z.label} — still to do`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:bg-background-100 hover:text-foreground-950"
              }`}
            >
              <i className={z.icon}></i>
              {z.label}
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${dotClass}`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}