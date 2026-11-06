import { approvalCompany, approvalTitle, type ApprovalItem } from "@/lib/approvals";

interface ApproveAllDialogProps {
  /** Every pending application that will be submitted. */
  items: ApprovalItem[];
  /** True while the batch request is in flight — locks the dialog. */
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The single explicit confirmation required before a batch "Approve all". Lists
 * exactly which companies/titles are about to be submitted (scrollable when the
 * queue is long) so the OK is never silent. Mirrors the base ConfirmDialog's
 * look, but with the scrollable submission list this flow needs.
 */
export default function ApproveAllDialog({
  items,
  busy,
  onConfirm,
  onCancel,
}: ApproveAllDialogProps) {
  const count = items.length;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground-950/40 dark:bg-black/55"
        onClick={busy ? undefined : onCancel}
      ></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4">
            <h3 className="font-heading text-lg font-medium text-foreground-950">
              Submit all {count} applications?
            </h3>
            <p className="text-sm text-foreground-600 mt-2">
              This sends every prepared application for real. You can&apos;t undo a submission.
            </p>

            <ul className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-background-200 bg-background-100/50 divide-y divide-background-200">
              {items.map((item) => (
                <li
                  key={String(item.application_id)}
                  className="flex items-start gap-2.5 px-3 py-2.5"
                >
                  <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
                    <i className="ri-send-plane-line text-xs"></i>
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground-900 truncate">
                      {approvalTitle(item)}
                    </p>
                    <p className="text-[11px] text-foreground-500 truncate">
                      {approvalCompany(item)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-accent-600 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Submitting…
                </>
              ) : (
                <>
                  <i className="ri-check-double-line"></i>
                  Confirm &amp; submit all
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}