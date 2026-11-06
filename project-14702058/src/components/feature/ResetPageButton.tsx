import { useState } from "react";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { clearViewState } from "@/lib/viewState";
import { clearRouteMemory } from "@/lib/routeMemory";

interface ResetPageButtonProps {
  /** Durable backend view name(s) to forget, e.g. "matches". */
  view: string | string[];
  /**
   * Session route key(s) to clear — scroll position + transient UI (open
   * panels). A trailing "*" clears every key with that prefix, e.g.
   * "documents/resumes*".
   */
  routeKeys: string | string[];
  /** Reset the page's own UI state back to its first-load defaults. */
  onReset?: () => void;
  className?: string;
}

/**
 * "Reset this page" — forgets everything the page remembers: the durable
 * view-state on the backend (DELETE /api/v1/view-state/{view}), the session's
 * scroll + open panels, and the page's own filters/tab/selection.
 */
export default function ResetPageButton({
  view,
  routeKeys,
  onReset,
  className = "",
}: ResetPageButtonProps) {
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    const views = Array.isArray(view) ? view : [view];
    await Promise.all(views.map((v) => clearViewState(v)));
    clearRouteMemory(routeKeys);
    window.scrollTo({ top: 0, behavior: "auto" });
    onReset?.();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Forget this page's remembered filters, tab, and scroll"
        className={`inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground-600 bg-background-50 border border-background-200 px-3.5 py-2.5 rounded-md hover:bg-background-100 hover:text-foreground-900 transition-colors cursor-pointer whitespace-nowrap ${className}`}
      >
        <i className="ri-restart-line"></i>
        Reset this page
      </button>

      {open && (
        <ConfirmDialog
          title="Reset this page?"
          message="This forgets the filters, tab, and scroll position this page remembers for you — on this device and every other — and returns the page to its default view. Your actual data isn't touched."
          confirmLabel="Reset"
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}