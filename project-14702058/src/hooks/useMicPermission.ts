import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone permission tracking for the interview section.
 *
 * Browsers expose the live grant state through the Permissions API (Chromium
 * today; others may not support the `microphone` name). When we can read it we
 * proactively tell the user that mic access is required — instead of only
 * failing after they press Record.
 */

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

interface PermissionStatusLike {
  state: string;
  onchange: (() => void) | null;
}

interface PermissionsLike {
  query: (descriptor: { name: string }) => Promise<PermissionStatusLike>;
}

/** True when the browser can capture audio at all (secure context + API). */
export function micCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function normalize(state: string | undefined): MicPermissionState {
  if (state === "granted" || state === "denied" || state === "prompt") return state;
  return "unknown";
}

export interface UseMicPermissionResult {
  /** Live permission state — "unknown" when the browser can't tell us. */
  state: MicPermissionState;
  /** Whether audio capture is supported in this browser/context. */
  supported: boolean;
  /** True while a permission request (getUserMedia) is in flight. */
  requesting: boolean;
  /**
   * Ask the browser for microphone access (triggers the permission prompt the
   * first time). Resolves true once access is granted.
   */
  request: () => Promise<boolean>;
  /** Re-read the current permission state. */
  refresh: () => Promise<void>;
}

export function useMicPermission(): UseMicPermissionResult {
  const [state, setState] = useState<MicPermissionState>("unknown");
  const [supported, setSupported] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const statusRef = useRef<PermissionStatusLike | null>(null);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const perms = (navigator as Navigator & { permissions?: PermissionsLike }).permissions;
    if (!perms || typeof perms.query !== "function") {
      setState("unknown");
      return;
    }
    try {
      const status = await perms.query({ name: "microphone" });
      statusRef.current = status;
      setState(normalize(status.state));
      // Keep the UI in sync if the user changes the grant while we're open.
      status.onchange = () => setState(normalize(status.state));
    } catch {
      // Safari/Firefox may not support querying "microphone" — stay unknown.
      setState("unknown");
    }
  }, []);

  useEffect(() => {
    setSupported(micCaptureSupported());
    void refresh();
    return () => {
      if (statusRef.current) statusRef.current.onchange = null;
    };
  }, [refresh]);

  const request = useCallback(async (): Promise<boolean> => {
    if (!micCaptureSupported()) {
      setState("unknown");
      return false;
    }
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refresh();
      return true;
    } catch {
      await refresh();
      return false;
    } finally {
      setRequesting(false);
    }
  }, [refresh]);

  return { state, supported, requesting, request, refresh };
}