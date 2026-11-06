import { useEffect, useRef } from "react";

/**
 * Run `refresh` whenever the user comes back to this tab.
 *
 * Switching browser tabs in the same window fires `visibilitychange` on the
 * document, while returning from another app or window fires `focus` on the
 * window — neither alone catches every "the user is back" case, so we listen to
 * both. That way data changed elsewhere (say, a site reconnected in another
 * tab) lands the moment the user comes back, instead of waiting for a manual
 * refresh.
 *
 * `enabled` lets a caller opt out (e.g. a card that only cares once the
 * extension is installed) without removing the hook from the tree.
 */
export function useRefreshOnFocus(refresh: () => void, enabled = true) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    const onWake = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [enabled]);
}

export default useRefreshOnFocus;