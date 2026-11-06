import { useState } from "react";
import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationStatus,
} from "@/lib/applications";
import { moveApplicationStatus } from "@/hooks/useApplicationsStore";
import { useToast } from "@/components/base/ToastProvider";
import { toneDot } from "@/pages/dashboard/components/tone";

function stageMeta(status: ApplicationStatus) {
  return APPLICATION_STAGES.find((s) => s.id === status) ?? APPLICATION_STAGES[0];
}

interface StageSelectProps {
  app: Application;
  /** Fired after a successful move (and after an undo) so the host can react. */
  onMoved?: () => void;
  disabled?: boolean;
  /** Accessible label, e.g. "Move Senior Designer to another stage". */
  ariaLabel?: string;
  className?: string;
}

/**
 * The inline stage picker used by the pipeline rows and the saved-jobs rows.
 * Moving a role updates the shared pipeline cache instantly and — because a
 * dropdown is easy to misclick — offers a one-tap Undo in the confirming toast
 * that restores the previous stage.
 */
export default function StageSelect({
  app,
  onMoved,
  disabled,
  ariaLabel,
  className = "",
}: StageSelectProps) {
  const { showToast } = useToast();
  const [moving, setMoving] = useState(false);
  const meta = stageMeta(app.status);

  async function handleChange(next: ApplicationStatus) {
    if (next === app.status || moving) return;
    const previous = app.status;
    setMoving(true);
    try {
      await moveApplicationStatus(app.id, next);
      onMoved?.();
      showToast(`Moved to ${stageMeta(next).label}.`, "success", {
        label: "Undo",
        onUndo: async () => {
          try {
            await moveApplicationStatus(app.id, previous);
            onMoved?.();
          } catch {
            // Undo is best-effort; the toast is already gone.
          }
        },
      });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not move the role.",
        "error",
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${toneDot[meta.tone]}`}></span>
      <select
        value={app.status}
        onChange={(e) => handleChange(e.target.value as ApplicationStatus)}
        disabled={moving || disabled}
        aria-label={ariaLabel ?? "Move to another stage"}
        className={`text-[11px] font-semibold bg-background-50 border border-background-200 rounded-md px-2 py-1.5 text-foreground-700 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer disabled:opacity-60 disabled:cursor-wait ${className}`}
      >
        {APPLICATION_STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </span>
  );
}