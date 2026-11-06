import { useEffect, useRef } from "react";

/**
 * Binds Alt+H to open the "My Work Highlights" wizard from anywhere in the
 * résumé editor. It follows the same Alt-prefix family as Alt+I ("Ask AI") and
 * Alt+D (Design), so the highest-leverage action stays one keystroke away.
 *
 * The latest handler is kept in a ref, so a fresh closure each render doesn't
 * re-bind the listener; it is registered once on mount.
 */
export default function useWorkHighlightsShortcut(onTrigger: () => void) {
  const handler = useRef(onTrigger);
  handler.current = onTrigger;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Alt (Option) + H only — ignore other modifier combos and Shift.
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "h") return;
      event.preventDefault();
      handler.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}