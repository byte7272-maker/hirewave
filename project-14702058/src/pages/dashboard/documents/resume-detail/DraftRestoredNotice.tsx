interface DraftRestoredNoticeProps {
  /** Discard the restored local draft and fall back to the saved document. */
  onDiscard: () => void;
}

/** Notice shown when an unsaved local draft was restored on load. */
export default function DraftRestoredNotice({ onDiscard }: DraftRestoredNoticeProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
      <i className="ri-history-line text-base mt-0.5"></i>
      <span className="flex-1">We restored your unsaved draft from this device.</span>
      <button
        onClick={onDiscard}
        className="text-sm font-semibold text-secondary-900 hover:text-foreground-950 underline cursor-pointer whitespace-nowrap"
      >
        Discard draft
      </button>
    </div>
  );
}