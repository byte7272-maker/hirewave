import { useEffect, useState } from "react";

type Status = "loading" | "loaded" | "failed";

interface SmartImageProps {
  src: string;
  alt?: string;
  title?: string;
  /** Classes applied to the <img> itself (positioning/sizing/object-fit). */
  className?: string;
  /** Decorative layer shown while loading and if the image never loads. */
  fallbackClassName?: string;
  /** Extra attempts (with a cache-busting param) after the first failure. */
  maxRetries?: number;
  loading?: "eager" | "lazy";
  ariaHidden?: boolean;
  /** Disable the fade-in transition. */
  noFade?: boolean;
}

/** Cache-busting param appended on retries so a failed response isn't reused. */
const RETRY_PARAM = "_r";

function resolveSrc(src: string, attempt: number): string {
  if (attempt <= 0) return src;
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}${RETRY_PARAM}=${attempt + 1}`;
}

/**
 * An <img> that never leaves an empty box. It retries a couple of times with a
 * cache-busting param (a transient/blocked load often succeeds on retry), fades
 * in once loaded, and otherwise keeps a token-based decorative layer visible
 * beneath it so the space always looks intentional.
 *
 * The parent element is expected to be positioned (relative/absolute) and sized.
 */
export default function SmartImage({
  src,
  alt = "",
  title,
  className = "",
  fallbackClassName = "bg-gradient-to-br from-background-100 via-background-50 to-secondary-100",
  maxRetries = 2,
  loading = "eager",
  ariaHidden,
  noFade = false,
}: SmartImageProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("loading");

  // A new source starts a fresh load/retry cycle.
  useEffect(() => {
    setAttempt(0);
    setStatus("loading");
  }, [src]);

  const resolvedSrc = resolveSrc(src, attempt);

  return (
    <>
      {status !== "loaded" && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${
            status === "loading" ? "animate-pulse" : ""
          } ${fallbackClassName}`}
        ></span>
      )}
      <img
        key={resolvedSrc}
        src={resolvedSrc}
        alt={alt}
        title={title}
        loading={loading}
        decoding="async"
        aria-hidden={ariaHidden}
        onLoad={() => setStatus("loaded")}
        onError={() => {
          if (attempt < maxRetries) setAttempt((a) => a + 1);
          else setStatus("failed");
        }}
        className={`${className}${
          noFade
            ? ""
            : ` transition-opacity duration-700 ${
                status === "loaded" ? "opacity-100" : "opacity-0"
              }`
        }`}
      />
    </>
  );
}