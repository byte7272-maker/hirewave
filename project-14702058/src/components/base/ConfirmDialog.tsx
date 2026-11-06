import { useState } from "react";
import Card from "@/components/base/Card";
import Button from "@/components/base/Button";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * The design system's confirmation dialog. Built on the shared `Card` surface and
 * the `Button` primitive (a quiet outline cancel and an `accent` confirm, since
 * these confirmations gate consequential actions), so it matches every modal.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      // Parent components surface errors in their own UI.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground-950/45 dark:bg-black/60 backdrop-blur-sm animate-fade" onClick={onCancel}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card surface="plain" tone="accent" className="w-full max-w-sm animate-pop">
          <div className="px-5 py-4">
            <h3 className="font-heading text-lg font-medium text-foreground-950">{title}</h3>
            <p className="text-sm text-foreground-600 mt-2">{message}</p>
          </div>
          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="accent" loading={busy} onClick={handleConfirm}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}