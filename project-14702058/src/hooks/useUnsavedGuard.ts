import { useEffect, useState } from "react";

/**
 * Warns before losing unsaved edits.
 *
 *  • A native `beforeunload` prompt covers tab close / refresh.
 *  • In-app link navigation (the app uses a plain `BrowserRouter`, so router
 *    blocking isn't available) is intercepted at the document level and parked
 *    as `pendingHref`; the caller renders its own confirm dialog and then either
 *    navigates or cancels.
 *
 * Returns the href the user tried to reach (or null) plus a cancel handler.
 */
export default function useUnsavedGuard(dirty: boolean, message: string) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) {
      setPendingHref(null);
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, message]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest(
        "a[href]"
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || /^[a-z]+:/i.test(href)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  return {
    pendingHref,
    cancelLeave: () => setPendingHref(null),
  };
}