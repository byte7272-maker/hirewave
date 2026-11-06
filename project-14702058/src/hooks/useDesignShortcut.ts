import { useEffect, useRef } from "react";

/**
 * Binds Alt+D to open the in-context Design chooser from anywhere in a document
 * editor. It follows the same Alt-prefix family as the "Ask AI" box (Alt+I), so
 * the design controls stay one keystroke away without leaving the document.
 *
 * The latest handler is kept in a ref, so a fresh closure each render doesn't
 * re-bind the listener; it is registered once on mount.
 */
export default function useDesignShortcut(onTrigger: () => void) {
  const handler = useRef(onTrigger);
  handler.current = onTrigger;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Alt (Option) + D only — ignore other modifier combos and Shift.
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "d") return;
      event.preventDefault();
      handler.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}