import type { MicPermissionState } from "@/hooks/useMicPermission";

interface MicPermissionNoticeProps {
  state: MicPermissionState;
  supported: boolean;
  requesting: boolean;
  onEnable: () => void;
  className?: string;
}

/**
 * Notifies the user when the interview needs microphone access that hasn't been
 * granted yet. Renders nothing once access is granted (or when the browser
 * can't report the state, so we don't nag with a false alarm).
 */
export default function MicPermissionNotice({
  state,
  supported,
  requesting,
  onEnable,
  className = "",
}: MicPermissionNoticeProps) {
  if (!supported || state === "granted" || state === "unknown") return null;

  const denied = state === "denied";

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs ${
        denied
          ? "bg-accent-100 text-accent-900"
          : "bg-amber-50 border border-amber-200 text-amber-900"
      } ${className}`}
    >
      <i
        className={`${denied ? "ri-mic-off-line" : "ri-mic-line"} text-base mt-0.5 flex-shrink-0`}
      ></i>
      <div className="flex-1 leading-relaxed">
        {denied ? (
          <span>
            Microphone access is blocked. Allow it in your browser to answer aloud — or type your
            answer instead.
          </span>
        ) : (
          <span>Microphone permission is required to answer aloud. Grant it to speak your answer.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onEnable}
        disabled={requesting}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
          denied
            ? "bg-accent-200/70 border-accent-200 text-accent-900 hover:bg-accent-200"
            : "bg-amber-100 border-amber-200 text-amber-900 hover:bg-amber-200"
        }`}
      >
        <i className={requesting ? "ri-loader-4-line animate-spin" : "ri-mic-line"}></i>
        {requesting ? "Checking…" : denied ? "Try again" : "Enable microphone"}
      </button>
    </div>
  );
}