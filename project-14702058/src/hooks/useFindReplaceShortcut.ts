import { useEffect, useRef } from "react";

/**
 * Binds Cmd/Ctrl+F to open the Find & Replace tool from anywhere in a document
 * editor — overriding the browser's own "find on page" so the in-editor tool is
 * always one keystroke away.
 *
 * The latest handler is kept in a ref, so a fresh closure each render doesn't
 * re-bind the listener; it is registered once on mount.
 */
export default function useFindReplaceShortcut(onTrigger: () => void) {
  const handler = useRef(onTrigger);
  handler.current = onTrigger;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd (Mac) or Ctrl (Win/Linux) + F, ignoring other modifier combos.
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key !== "f" && event.key !== "F") return;
      event.preventDefault();
      handler.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}