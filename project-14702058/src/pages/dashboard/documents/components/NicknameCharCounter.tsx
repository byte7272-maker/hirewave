import { NICKNAME_COUNTER_FROM, NICKNAME_MAX } from "./versionMeta";

/**
 * A tiny "N/80" counter for the nickname editors, shown ONLY once the draft is
 * close to the API's cap so it stays out of the way while naming. It warms to the
 * accent tone as the limit approaches and marks the moment the cap is reached.
 */
export default function NicknameCharCounter({ length }: { length: number }) {
  if (length < NICKNAME_COUNTER_FROM) return null;
  const atCap = length >= NICKNAME_MAX;
  const nearCap = length >= NICKNAME_MAX - 8;
  return (
    <span
      className={`text-[10px] font-medium tabular-nums whitespace-nowrap ${
        atCap
          ? "text-accent-700 font-semibold"
          : nearCap
            ? "text-accent-600"
            : "text-foreground-400"
      }`}
      aria-live="polite"
    >
      {length}/{NICKNAME_MAX}
    </span>
  );
}