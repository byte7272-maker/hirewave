import { useEffect, useRef } from "react";
import { readScroll, writeScroll } from "@/lib/routeMemory";

/**
 * Restore a page's scroll offset once `ready` (the list has rendered) and keep
 * it in sessionStorage so back/forward feels native. A durable `fallback`
 * (the backend view-state's scrollY) is used when the session has none yet —
 * e.g. the very first open on a new device.
 */
export default function useScrollRestore(
  scrollKey: string,
  ready: boolean,
  fallback = 0,
): void {
  const restored = useRef(false);
  const latest = useRef(0);

  // A new route key is a fresh slate for the one-shot restore.
  useEffect(() => {
    restored.current = false;
    latest.current = 0;
  }, [scrollKey]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = readScroll(scrollKey) || fallback;
    if (y > 0) {
      // Wait two frames so the list has laid out and the target offset exists.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      });
    }
  }, [ready, scrollKey, fallback]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        latest.current = window.scrollY;
        writeScroll(scrollKey, latest.current);
      });
    };
    const flush = () => {
      if (latest.current > 0) writeScroll(scrollKey, latest.current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", flush);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      flush();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", flush);
    };
  }, [scrollKey]);
}