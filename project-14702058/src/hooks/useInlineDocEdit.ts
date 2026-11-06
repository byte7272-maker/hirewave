import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { RephraseMode } from "@/lib/documents";
import { enableSectionReorder } from "@/lib/docSectionReorder";

/**
 * Drives direct inline editing + selection capture inside the rendered document
 * iframe (which is a same-origin `srcDoc`, so its DOM is fully reachable).
 *
 *  • Double-click any word / line → the document becomes editable in place.
 *  • Enter (no Shift) or clicking away → the edited text is persisted.
 *  • Esc → the edit is cancelled and the original document is restored.
 *  • Selecting any span → an anchor is reported so a floating rephrase toolbar
 *    can be shown; applying a replacement rewrites the selection and persists.
 *
 * Persisting is delegated to `onSave` (the page creates a new version), so the
 * hook stays document-agnostic — résumés and cover letters share it verbatim.
 */

export interface InlineSelectionState {
  text: string;
  context: string;
  mode: RephraseMode;
  /** Fixed-position anchor in the parent viewport (the toolbar sits above it). */
  left: number;
  top: number;
}

/** The accepted before/after pair from an inline rephrase, so the caller can
 * record it against the version it produced and show a compact diff later. */
export interface RephraseEditMeta {
  before: string;
  after: string;
  mode: RephraseMode;
  instruction?: string;
}

/** Extra context handed to `onSave` alongside the persisted document text. */
export interface InlineEditMeta {
  rephrase?: RephraseEditMeta;
  /**
   * Why a save happened, for the version note / toast:
   * "section-move" — a section was drag-reordered; "section-move-undo" — that
   * drag was reverted in one click (without a manual version switch).
   */
  reason?: "section-move" | "section-move-undo";
}

/** Presets surfaced as keyboard shortcuts, in Ctrl/⌘+Shift+1…4 order. */
const REPHRASE_SHORTCUT_PRESETS = ["Concise", "Stronger verb", "Warmer", "Fix grammar"];

/**
 * How long a section drag stays "pending" before it is saved as a version.
 * A section move — and a quick undo of it — collapses into a single save (or
 * none at all), so repeated accidental drags never pile up version entries.
 */
const MOVE_COALESCE_MS = 1200;

interface UseInlineDocEditArgs {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  zoom: number;
  /** Enables double-click inline editing and persisting rephrase commits. */
  canEdit: boolean;
  /** Persist the document text (the page creates a new version). */
  onSave?: (text: string, meta?: InlineEditMeta) => Promise<void> | void;
  /** Single-click handler when not editing — e.g. open the full editor. */
  onOpen?: () => void;
}

/** Collapse whitespace noise the browser introduces, keeping paragraph breaks. */
function normalizeDocText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Infer the rephrase mode from the shape of the selected text. */
function inferMode(text: string): RephraseMode {
  const trimmed = text.trim();
  if (!trimmed) return "sentence";
  if (!/\s/.test(trimmed)) return "word";
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length <= 1 && !/\n/.test(trimmed)) return "sentence";
  return "paragraph";
}

/** A little surrounding text (the containing block) so the rephrase fits. */
function surroundingContext(node: Node | null): string {
  if (!node) return "";
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node.parentElement as Element | null);
  const block =
    el?.closest("p, li, td, h1, h2, h3, h4, h5, figcaption") ??
    el?.closest("div, section, article") ??
    el;
  const text = (block?.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 400 ? text.slice(0, 400) : text;
}

export default function useInlineDocEdit({
  iframeRef,
  scrollRef,
  zoom,
  canEdit,
  onSave,
  onOpen,
}: UseInlineDocEditArgs) {
  const [selection, setSelection] = useState<InlineSelectionState | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Whether the last section drag can still be undone in one click. */
  const [sectionMoveUndoable, setSectionMoveUndoable] = useState(false);
  /**
   * True from the moment a section drag settles until its (deferred) save
   * finishes — drives the "Saving section move…" indicator so the short wait
   * before the version is created stays visible to the user.
   */
  const [sectionMovePending, setSectionMovePending] = useState(false);

  const docRef = useRef<Document | null>(null);
  const winRef = useRef<Window | null>(null);
  /** The document HTML as it was before the current inline edit (for Esc). */
  const snapshotRef = useRef("");
  /** The document text as it was before the current edit (for change detection). */
  const originalTextRef = useRef("");
  const editingRef = useRef(false);
  const selectionRef = useRef<InlineSelectionState | null>(null);
  const savingRef = useRef(false);
  const zoomRef = useRef(zoom);
  const canEditRef = useRef(canEdit);
  const saveRef = useRef(onSave);
  const openRef = useRef(onOpen);
  /** Meta for the next persist (e.g. the accepted rephrase pair). Cleared on read. */
  const pendingMetaRef = useRef<InlineEditMeta | null>(null);
  /** Cleanup for the section drag-reorder decoration on the current document. */
  const reorderCleanupRef = useRef<(() => void) | null>(null);
  /** Re-arms the section drag handles after the document DOM is restored (undo). */
  const decorateSectionsRef = useRef<(() => void) | null>(null);
  /** The pending (not-yet-saved) section move; cleared once it commits or is undone. */
  const pendingMoveRef = useRef<{ timer: number } | null>(null);
  /** Whether the latest section move is still unsaved (drives move coalescing). */
  const moveUnsavedRef = useRef(false);
  /** Handler registered by the rephrase toolbar to run from a keyboard shortcut. */
  const rephraseShortcutRef = useRef<((instruction?: string) => void) | null>(null);
  /** Handler registered by the rephrase toolbar to copy the selection (⌘/Ctrl+Shift+C). */
  const copyShortcutRef = useRef<(() => void) | null>(null);
  /** Document text as it was before the most recent section drag (for one-click undo). */
  const sectionMoveTextRef = useRef<string | null>(null);
  /** A revert queued while a section-move save was already in flight. */
  const queuedUndoRef = useRef<string | null>(null);

  zoomRef.current = zoom;
  canEditRef.current = canEdit;
  saveRef.current = onSave;
  openRef.current = onOpen;
  selectionRef.current = selection;

  /** Position the toolbar above the selection in parent (fixed) coordinates. */
  const computeAnchor = useCallback(
    (range: Range): { left: number; top: number } | null => {
      const iframe = iframeRef.current;
      if (!iframe) return null;
      const frame = iframe.getBoundingClientRect();
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;
      const scale = zoomRef.current || 1;
      const half = 176;
      const left = Math.min(
        Math.max(frame.left + (rect.left + rect.width / 2) * scale, half + 8),
        window.innerWidth - half - 8
      );
      const top = Math.max(frame.top + rect.top * scale - 10, 82);
      return { left, top };
    },
    [iframeRef]
  );

  /** Re-save the pre-move document text (reverts a committed section move). */
  const revertTo = useCallback(async (text: string): Promise<boolean> => {
    if (!saveRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveRef.current(text, { reason: "section-move-undo" });
      return true;
    } catch {
      // Keep the affordance so the user can retry if the save failed.
      sectionMoveTextRef.current = text;
      setSectionMoveUndoable(true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  /** Persist the current document text as a new version (only if it changed). */
  const persist = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || !doc.body || savingRef.current) return;
    const hadPendingMove = Boolean(pendingMoveRef.current);
    // Any save (a move or an edit) settles a still-pending section-move timer,
    // so the move is folded into this single version instead of a second one.
    if (pendingMoveRef.current) {
      window.clearTimeout(pendingMoveRef.current.timer);
      pendingMoveRef.current = null;
    }
    const meta = pendingMetaRef.current;
    pendingMetaRef.current = null;
    moveUnsavedRef.current = false;
    const isMove = meta?.reason === "section-move";
    // A pending move folded into a different save (an edit or rephrase) is now
    // persisted — clear its indicator so it can never get stuck on.
    if (hadPendingMove && !isMove) setSectionMovePending(false);
    const previous = normalizeDocText(originalTextRef.current);
    const text = normalizeDocText(doc.body.innerText || "");
    doc.body.contentEditable = "false";
    editingRef.current = false;
    setEditing(false);
    snapshotRef.current = doc.body.innerHTML;
    originalTextRef.current = doc.body.innerText || "";
    if (!text || text === previous || !saveRef.current) {
      if (isMove) setSectionMovePending(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveRef.current(text, meta ?? undefined);
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (isMove) setSectionMovePending(false);
      // A cancel landed while this save was in flight — revert right away.
      const queued = queuedUndoRef.current;
      if (queued) {
        queuedUndoRef.current = null;
        void revertTo(queued);
      }
    }
  }, [revertTo]);

  /** Cancel the current inline edit and restore the pre-edit document. */
  const cancel = useCallback(() => {
    const doc = docRef.current;
    if (!doc || !doc.body) return;
    if (editingRef.current) doc.body.innerHTML = snapshotRef.current;
    doc.body.contentEditable = "false";
    editingRef.current = false;
    setEditing(false);
    setSelection(null);
  }, []);

  /** Enter inline edit mode and place the caret near the double-click point. */
  const beginEdit = useCallback((x: number, y: number) => {
    const doc = docRef.current;
    const win = winRef.current;
    if (!doc || !doc.body || !win || editingRef.current || !canEditRef.current) return;
    snapshotRef.current = doc.body.innerHTML;
    // While a section move is still unsaved, keep the pre-move baseline so a
    // cancelled edit can't make the pending move look like "no change" and drop it.
    if (!moveUnsavedRef.current) originalTextRef.current = doc.body.innerText || "";
    doc.body.contentEditable = "true";
    doc.body.spellcheck = false;
    editingRef.current = true;
    setEditing(true);
    try {
      win.focus();
    } catch {
      /* focus can fail if the frame detaches — non-fatal */
    }
    // Place the caret where the user double-clicked (best effort across engines).
    const anyDoc = doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null;
    };
    let caret: Range | null = null;
    try {
      if (typeof anyDoc.caretRangeFromPoint === "function") {
        caret = anyDoc.caretRangeFromPoint(x, y);
      } else if (typeof anyDoc.caretPositionFromPoint === "function") {
        const pos = anyDoc.caretPositionFromPoint(x, y);
        if (pos) {
          caret = doc.createRange();
          caret.setStart(pos.offsetNode, pos.offset);
          caret.collapse(true);
        }
      }
    } catch {
      caret = null;
    }
    if (caret) {
      const sel = win.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(caret);
    }
  }, []);

  /** Replace the current selection with rewritten text, then persist. */
  const applyRephrase = useCallback(
    (replacement: string, instruction?: string) => {
      const doc = docRef.current;
      const win = winRef.current;
      if (!doc || !win) return;
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        setSelection(null);
        return;
      }
      // Capture the replaced span before the DOM edit, for the version diff.
      const before = selectionRef.current?.text ?? range.toString();
      const mode = selectionRef.current?.mode ?? inferMode(before);
      range.deleteContents();
      const node = doc.createTextNode(replacement);
      range.insertNode(node);
      const after = doc.createRange();
      after.setStartAfter(node);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      setSelection(null);
      pendingMetaRef.current = {
        rephrase: {
          before,
          after: replacement,
          mode,
          ...(instruction ? { instruction } : {}),
        },
      };
      void persist();
    },
    [persist]
  );

  /**
   * Commit a section move as a version, coalescing rapid successive moves into a
   * single save. While an edit is in progress (or a save is in flight) the commit
   * is deferred instead of clobbering it.
   */
  const scheduleMoveCommit = useCallback(() => {
    // Surface the deferred save right away, so the brief wait before the
    // version is created reads as "working" rather than nothing happening.
    setSectionMovePending(true);
    if (pendingMoveRef.current) window.clearTimeout(pendingMoveRef.current.timer);
    const run = () => {
      if (editingRef.current || savingRef.current) {
        pendingMoveRef.current = { timer: window.setTimeout(run, MOVE_COALESCE_MS) };
        return;
      }
      pendingMoveRef.current = null;
      pendingMetaRef.current = { reason: "section-move" };
      void persist();
    };
    pendingMoveRef.current = { timer: window.setTimeout(run, MOVE_COALESCE_MS) };
  }, [persist]);

  /** Wire listeners into a freshly-loaded iframe document. */
  const attach = useCallback(
    (doc: Document, win: Window) => {
      if (!doc.body) return;
      docRef.current = doc;
      winRef.current = win;
      snapshotRef.current = doc.body.innerHTML;
      originalTextRef.current = doc.body.innerText || "";
      if (openRef.current) doc.body.style.cursor = "pointer";

      // Section drag-to-reorder handles live alongside the inline-edit wiring.
      const decorate = () => {
        reorderCleanupRef.current?.();
        reorderCleanupRef.current = null;
        if (!canEditRef.current) return;
        reorderCleanupRef.current = enableSectionReorder(doc, {
          canReorder: () => canEditRef.current && !editingRef.current,
          onReorder: (beforeText) => {
            if (beforeText.trim()) {
              // Keep the earliest pre-move text so undo reverts the whole session,
              // then coalesce rapid moves into one deferred save (no version pile-up).
              if (!moveUnsavedRef.current) sectionMoveTextRef.current = beforeText;
              moveUnsavedRef.current = true;
              setSectionMoveUndoable(true);
              scheduleMoveCommit();
            }
          },
        });
      };
      decorateSectionsRef.current = decorate;
      decorate();

      const onMouseUp = () => {
        win.setTimeout(() => {
          if (!canEditRef.current) return;
          const sel = win.getSelection();
          if (!sel || sel.isCollapsed || !sel.toString().trim()) {
            setSelection(null);
            return;
          }
          const node = sel.anchorNode;
          if (!node || !doc.body.contains(node)) {
            setSelection(null);
            return;
          }
          const anchor = computeAnchor(sel.getRangeAt(0));
          if (!anchor) return;
          const text = sel.toString();
          setSelection({
            text,
            context: surroundingContext(node),
            mode: inferMode(text),
            left: anchor.left,
            top: anchor.top,
          });
        }, 0);
      };

      // Single-click opens the editor, but a double-click (edit) must win — so
      // defer the open briefly and cancel it if a second click / dblclick lands.
      let clickTimer: number | null = null;
      let lastClick = 0;
      const onDocClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a[href]")) return;
        if (editingRef.current || !openRef.current) return;
        const sel = win.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        const now = Date.now();
        const isSecond = now - lastClick < 330;
        lastClick = now;
        if (clickTimer) {
          window.clearTimeout(clickTimer);
          clickTimer = null;
        }
        if (isSecond) return;
        clickTimer = window.setTimeout(() => {
          clickTimer = null;
          openRef.current?.();
        }, 300);
      };

      const onDblClick = (event: MouseEvent) => {
        if (clickTimer) {
          window.clearTimeout(clickTimer);
          clickTimer = null;
        }
        setSelection(null);
        beginEdit(event.clientX, event.clientY);
      };

      const onKeyDown = (event: KeyboardEvent) => {
        // Preset shortcuts — only while a selection is active and the rephrase
        // toolbar has registered its runner (Ctrl/⌘ + Shift + R / 1–4).
        const mod = event.metaKey || event.ctrlKey;
        // Copy the selection so it can be saved before rewriting (⌘/Ctrl+Shift+C).
        if (
          mod &&
          event.shiftKey &&
          event.code === "KeyC" &&
          selectionRef.current &&
          copyShortcutRef.current
        ) {
          event.preventDefault();
          copyShortcutRef.current();
          return;
        }
        if (mod && event.shiftKey && selectionRef.current && rephraseShortcutRef.current) {
          const code = event.code;
          let instruction: string | undefined;
          let matched = true;
          if (code === "KeyR") instruction = undefined;
          else if (code === "Digit1") instruction = REPHRASE_SHORTCUT_PRESETS[0];
          else if (code === "Digit2") instruction = REPHRASE_SHORTCUT_PRESETS[1];
          else if (code === "Digit3") instruction = REPHRASE_SHORTCUT_PRESETS[2];
          else if (code === "Digit4") instruction = REPHRASE_SHORTCUT_PRESETS[3];
          else matched = false;
          if (matched) {
            event.preventDefault();
            rephraseShortcutRef.current(instruction);
            return;
          }
        }
        if (event.key === "Escape") {
          if (selectionRef.current) {
            setSelection(null);
            return;
          }
          if (editingRef.current) {
            event.preventDefault();
            cancel();
          }
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && editingRef.current) {
          event.preventDefault();
          void persist();
        }
      };

      const onBlur = () => {
        if (editingRef.current && !selectionRef.current) void persist();
      };

      doc.addEventListener("mouseup", onMouseUp);
      doc.addEventListener("click", onDocClick);
      doc.addEventListener("dblclick", onDblClick);
      doc.addEventListener("keydown", onKeyDown);
      win.addEventListener("blur", onBlur);
    },
    [beginEdit, cancel, computeAnchor, persist, scheduleMoveCommit]
  );

  /** Reset all transient state when the viewer is pointed at another document. */
  const reset = useCallback(() => {
    reorderCleanupRef.current?.();
    reorderCleanupRef.current = null;
    decorateSectionsRef.current = null;
    if (pendingMoveRef.current) {
      window.clearTimeout(pendingMoveRef.current.timer);
      pendingMoveRef.current = null;
    }
    moveUnsavedRef.current = false;
    queuedUndoRef.current = null;
    setSectionMovePending(false);
    docRef.current = null;
    winRef.current = null;
    editingRef.current = false;
    setEditing(false);
    setSelection(null);
  }, []);

  // Stop any pending section-move timer on unmount so it can't fire on a stale doc.
  useEffect(
    () => () => {
      if (pendingMoveRef.current) window.clearTimeout(pendingMoveRef.current.timer);
      pendingMoveRef.current = null;
    },
    []
  );

  /**
   * Let the rephrase toolbar register the runner its keyboard shortcuts invoke.
   * Passing null clears it. Returns an unregister function for effect cleanup.
   */
  const registerRephraseShortcut = useCallback(
    (handler: ((instruction?: string) => void) | null) => {
      rephraseShortcutRef.current = handler;
      return () => {
        if (rephraseShortcutRef.current === handler) rephraseShortcutRef.current = null;
      };
    },
    []
  );

  /**
   * Let the rephrase toolbar register the copy runner its ⌘/Ctrl+Shift+C
   * shortcut invokes. Passing null clears it. Returns an unregister function.
   */
  const registerCopyShortcut = useCallback((handler: (() => void) | null) => {
    copyShortcutRef.current = handler;
    return () => {
      if (copyShortcutRef.current === handler) copyShortcutRef.current = null;
    };
  }, []);

  /**
   * One-click undo for the last section drag. It re-saves the pre-move document
   * text through the same version path, so the order reverts without the user
   * having to open the version history and switch versions by hand.
   */
  const undoSectionMove = useCallback(async (): Promise<boolean> => {
    // If the move is still pending (not yet saved), cancel it outright — no
    // version is ever created, so repeated accidental drags leave no entries.
    if (pendingMoveRef.current) {
      window.clearTimeout(pendingMoveRef.current.timer);
      pendingMoveRef.current = null;
      moveUnsavedRef.current = false;
      sectionMoveTextRef.current = null;
      setSectionMoveUndoable(false);
      setSectionMovePending(false);
      const doc = docRef.current;
      if (doc?.body && snapshotRef.current) doc.body.innerHTML = snapshotRef.current;
      decorateSectionsRef.current?.();
      return true;
    }

    const before = sectionMoveTextRef.current;
    if (!before || !saveRef.current) return false;
    sectionMoveTextRef.current = null;
    setSectionMoveUndoable(false);
    // A save is already in flight — queue the revert so it wins once it settles.
    if (savingRef.current) {
      queuedUndoRef.current = before;
      return true;
    }
    return revertTo(before);
  }, [revertTo]);

  /**
   * One-click cancel for the "Saving section move…" indicator: cancels a move
   * that hasn't been saved yet (no version created), or queues a revert when the
   * save has already started — so an abort never has to hunt for the undo button.
   */
  const cancelSectionMove = useCallback((): Promise<boolean> => {
    return undoSectionMove();
  }, [undoSectionMove]);

  /** Forget any pending section-move undo (e.g. after switching documents). */
  const clearSectionMove = useCallback(() => {
    sectionMoveTextRef.current = null;
    setSectionMoveUndoable(false);
  }, []);

  // Close the toolbar when the preview scrolls or the window resizes.
  useEffect(() => {
    if (!selection) return;
    const close = () => setSelection(null);
    const scroller = scrollRef.current;
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [selection, scrollRef]);

  // Close the toolbar when clicking anywhere outside it (the iframe handles its own).
  useEffect(() => {
    if (!selection) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-rephrase-toolbar]")) return;
      if (iframeRef.current && target === iframeRef.current) return;
      setSelection(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selection, iframeRef]);

  return {
    selection,
    editing,
    saving,
    sectionMovePending,
    attach,
    reset,
    applyRephrase,
    closeSelection: () => setSelection(null),
    cancelEdit: cancel,
    registerRephraseShortcut,
    registerCopyShortcut,
    canUndoSectionMove: sectionMoveUndoable,
    undoSectionMove,
    cancelSectionMove,
    clearSectionMove,
  };
}