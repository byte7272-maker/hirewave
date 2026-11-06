import { useEffect, useRef } from "react";

/**
 * Binds Cmd/Ctrl+Z to undo the last version switch — the exact same action the
 * "Undo switch" toast offers, now reachable from the keyboard.
 *
 * Two safeguards keep it from getting in the way:
 *  - It stands down while the caret is in a text field (input / textarea /
 *    contenteditable), so the browser's own text undo keeps working there.
 *  - It only acts while a switch is genuinely revertible (`canUndo` returns true,
 *    i.e. a previous version is known AND still differs from the current one), so
 *    a stray Cmd/Ctrl+Z never appears to do nothing.
 *
 * The latest predicate/handler are kept in refs, so a fresh closure each render
 * never re-binds the listener; it is registered once on mount.
 */
export default function useUndoVersionShortcut(
  canUndo: () => boolean,
  onUndo: () => void
) {
  const canRef = useRef(canUndo);
  canRef.current = canUndo;
  const undoRef = useRef(onUndo);
  undoRef.current = onUndo;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd (Mac) or Ctrl (Win/Linux) + Z, ignoring Shift (redo) and Alt.
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key !== "z" && event.key !== "Z") return;
      // Let native text undo win while the caret is in a field.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (!canRef.current()) return;
      event.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}