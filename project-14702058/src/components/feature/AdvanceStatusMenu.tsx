import { useEffect, useRef, useState } from "react";
import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationStatus,
  type CreateApplicationInput,
} from "@/lib/applications";
import {
  createAndAddApplication,
  moveApplicationStatus,
} from "@/hooks/useApplicationsStore";
import { useToast } from "@/components/base/ToastProvider";
import { toneDot } from "@/pages/dashboard/components/tone";

interface AdvanceStatusMenuProps {
  /** The pipeline entry to advance. Omit when the role isn't tracked yet. */
  app?: Application | null;
  /** When there's no application yet, the role to create on advance. */
  createInput?: CreateApplicationInput;
  /** Role title, used for the button tooltip / a11y label. */
  title?: string;
  blocked?: boolean;
  className?: string;
}

/** The label for the immediate next step, keyed off the current stage. */
function nextLabel(status: ApplicationStatus): string {
  switch (status) {
    case "draft":
      return "Mark as submitted";
    case "submitted":
      return "Move to interview";
    case "interviewing":
      return "Move to offer";
    default:
      return "Advance";
  }
}

/**
 * One-tap progression for a role without opening the board. The primary button
 * jumps to the immediate next stage (Draft → Submitted → Interviewing → Offer);
 * the caret opens a small menu to skip straight ahead. When the role isn't in
 * the pipeline yet, advancing creates it at the chosen stage. A misclick is one
 * tap to undo.
 */
export default function AdvanceStatusMenu({
  app,
  createInput,
  title,
  blocked = false,
  className = "",
}: AdvanceStatusMenuProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const status: ApplicationStatus = app?.status ?? "draft";
  const currentIndex = APPLICATION_STAGES.findIndex((s) => s.id === status);
  // Everything ahead of the current stage — the immediate one drives the button.
  const forward = APPLICATION_STAGES.slice(currentIndex + 1);
  const primaryStage = forward[0];

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Nothing to advance to (already at Offer) — render nothing.
  if (!primaryStage) return null;

  async function advance(to: ApplicationStatus) {
    if (busy || blocked) return;
    const previous = status;
    setBusy(true);
    try {
      let targetId = app?.id;
      if (targetId == null) {
        if (!createInput) return;
        const created = await createAndAddApplication(createInput);
        targetId = created.id;
      }
      await moveApplicationStatus(targetId, to);
      const label = APPLICATION_STAGES.find((s) => s.id === to)?.label ?? to;
      setOpen(false);
      showToast(`Moved to ${label}.`, "success", {
        label: "Undo",
        onUndo: async () => {
          try {
            if (app?.id != null) await moveApplicationStatus(app.id, previous);
            else if (targetId != null) await moveApplicationStatus(targetId, "draft");
          } catch {
            // Undo is best-effort; the toast is already gone.
          }
        },
      });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not update the role.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="inline-flex items-stretch rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => advance(primaryStage.id)}
          disabled={busy || blocked}
          title={title ? `${nextLabel(status)} — ${title}` : nextLabel(status)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 pl-2.5 pr-2 py-1.5 hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={busy ? "ri-loader-4-line animate-spin" : "ri-send-plane-line"}></i>
          {nextLabel(status)}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy || blocked}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Choose the next stage"
          className="inline-flex items-center justify-center bg-primary-500 text-background-50 dark:text-foreground-950 border-l border-background-50/30 px-1.5 hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          <i className={`ri-arrow-down-s-line transition-transform ${open ? "rotate-180" : ""}`}></i>
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-52 rounded-xl bg-background-50 border border-background-200 p-1.5"
        >
          <p className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
            Advance this role
          </p>
          {forward.map((stage) => (
            <button
              key={stage.id}
              type="button"
              role="menuitem"
              onClick={() => advance(stage.id)}
              disabled={busy}
              className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-background-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span
                className={`w-2 h-2 flex-shrink-0 rounded-full ${toneDot[stage.tone]}`}
              ></span>
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground-950 truncate">
                Move to {stage.label}
              </span>
              {stage.id === primaryStage.id && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 whitespace-nowrap">
                  Next
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}