import { useEffect, useRef } from "react";

/**
 * Binds Cmd/Ctrl+S to save the current document and Shift+Cmd/Ctrl+S to save it
 * as a new tracked version — the exact two actions the editor toolbar's Save and
 * "Save as new version" buttons perform, available from anywhere in the editor.
 *
 * The browser's own "save this page" dialog is suppressed so the in-editor save
 * is always the one that runs. The latest handlers are kept in refs, so a fresh
 * closure each render never re-binds the listener.
 */
export default function useDocumentSaveShortcut(
  onSave: () => void,
  onSaveAsVersion: () => void
) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const saveVersionRef = useRef(onSaveAsVersion);
  saveVersionRef.current = onSaveAsVersion;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd (Mac) or Ctrl (Win/Linux) + S, ignoring other modifier combos.
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key !== "s" && event.key !== "S") return;
      event.preventDefault();
      if (event.shiftKey) saveVersionRef.current();
      else saveRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}