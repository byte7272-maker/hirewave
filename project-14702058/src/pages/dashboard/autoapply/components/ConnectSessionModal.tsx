import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getFreshAccessToken } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useExtensionName } from "@/hooks/useBranding";
import { useToast } from "@/components/base/ToastProvider";
import {
  pollConnectIntent,
  startConnectIntent,
  type ConnectIntent,
} from "@/lib/autoApply";
import {
  connectViaExtension,
  detectExtension,
  onHarborConnectReady,
  EXTENSION_STORE_URL,
  EXTENSION_STORE_READY,
} from "@/lib/connectExtension";

const API_BASE =
  import.meta.env.VITE_PUBLIC_API_BASE_URL || "https://hirewave-production-3db3.up.railway.app";

interface ConnectSessionModalProps {
  provider: string;
  name: string;
  loginUrl: string;
  onClose: () => void;
  onConnected: () => void;
}

/** How we can connect, decided on open. */
type Mode = "detecting" | "direct" | "code" | "absent";
/** Pairing-code fallback lifecycle. */
type CodePhase = "starting" | "pending" | "connected" | "expired" | "error";
/** Code-free connect lifecycle. */
type DirectState = "idle" | "connecting" | "connected" | "error";

function formatCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ConnectSessionModal({
  provider,
  name,
  loginUrl,
  onClose,
  onConnected,
}: ConnectSessionModalProps) {
  const [mode, setMode] = useState<Mode>("detecting");

  const [directState, setDirectState] = useState<DirectState>("idle");
  const [directError, setDirectError] = useState("");

  const [phase, setPhase] = useState<CodePhase>("starting");
  const [intent, setIntent] = useState<ConnectIntent | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const autoCopiedRef = useRef(false);

  const { user } = useCurrentUser();
  const { showToast } = useToast();
  const extensionName = useExtensionName();

  // 1. Detect capability the moment the modal opens, and upgrade live if the
  // extension injects late (harbor-connect-ready) without needing a refresh.
  useEffect(() => {
    let cancelled = false;
    const reDetect = () => {
      detectExtension().then((result) => {
        if (cancelled) return;
        setMode((prev) => {
          if (result === "direct") return "direct";
          if (result === "legacy") {
            return prev === "detecting" || prev === "absent" ? "code" : prev;
          }
          return prev === "detecting" ? "absent" : prev;
        });
      });
    };
    reDetect();
    const off = onHarborConnectReady(reDetect);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // 3. Pairing-code fallback: issue a connect-intent when we enter code mode.
  const start = useCallback(async () => {
    setPhase("starting");
    setErrorMsg("");
    autoCopiedRef.current = false;
    try {
      const res = await startConnectIntent(provider);
      setIntent(res);
      const ms = new Date(res.expires_at).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
      setPhase("pending");
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not start pairing.");
      setPhase("error");
    }
  }, [provider]);

  useEffect(() => {
    if (mode !== "code" || intent) return;
    start();
  }, [mode, intent, start]);

  // Countdown ticker.
  useEffect(() => {
    if (phase !== "pending" || !intent) return;
    const id = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, intent]);

  // Expire when the countdown reaches zero.
  useEffect(() => {
    if (phase === "pending" && remaining === 0) setPhase("expired");
  }, [phase, remaining]);

  // Live "waiting" poll — flips to connected on its own.
  useEffect(() => {
    if (phase !== "pending" || !intent) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await pollConnectIntent(intent.code);
        if (cancelled) return;
        if (res.status === "connected") {
          setPhase("connected");
        } else if (res.status === "expired") setPhase("expired");
      } catch {
        // Transient errors are ignored; the next tick retries.
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, intent, provider]);

  // Auto-copy the code the instant it's ready, with a "Copied ✓" toast,
  // so the fallback is a paste-and-go instead of a manual copy.
  useEffect(() => {
    if (phase !== "pending" || !intent || autoCopiedRef.current) return;
    autoCopiedRef.current = true;
    try {
      void navigator.clipboard?.writeText(intent.code).then(() => {
        setCopied(true);
        showToast("Copied ✓", "success");
        setTimeout(() => setCopied(false), 2200);
      });
    } catch {
      // Clipboard may be blocked — the manual Copy button still works.
    }
  }, [phase, intent, showToast]);

  // Auto-close once connected so the parent re-fetches the session list.
  useEffect(() => {
    if (phase !== "connected" && directState !== "connected") return;
    const id = setTimeout(() => onConnected(), 1400);
    return () => clearTimeout(id);
  }, [phase, directState, onConnected]);

  async function copyCode() {
    if (!intent) return;
    try {
      await navigator.clipboard.writeText(intent.code);
      setCopied(true);
      showToast("Copied ✓", "success");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore copy failure
    }
  }

  // 2. Code-free connect through the extension.
  async function handleDirectConnect() {
    setDirectState("connecting");
    setDirectError("");
    // Pull a fresh token first: this hand-off bypasses the api() wrapper, so
    // after an idle spell a raw getAccess() could hand the extension an expired
    // one and the capture would 401. getFreshAccessToken() refreshes ahead of
    // expiry (single-flight, same as every other call) before we pass it over.
    const token = await getFreshAccessToken();
    const res = await connectViaExtension({
      provider,
      token,
      apiBase: API_BASE,
      label: user?.email,
      extensionName,
    });
    if (res.ok) {
      setDirectState("connected");
    } else {
      setDirectState("error");
      setDirectError(res.error ?? "Connection failed — please try again.");
    }
  }

  const steps = [
    { n: 1, text: `Open ${extensionName}` },
    { n: 2, text: `Pick ${name}` },
    { n: 3, text: "Paste — it's already copied" },
    { n: 4, text: "Connect" },
  ];

  const connected = directState === "connected" || phase === "connected";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">
              Connect {name}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          <div className="p-5">
            {mode === "detecting" && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Checking how to connect…
              </div>
            )}

            {/* ---- Success (either path) ---- */}
            {connected && (
              <div className="space-y-3 text-center py-10">
                <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-primary-100 text-primary-900">
                  <i className="ri-check-line text-2xl"></i>
                </div>
                <p className="text-sm font-semibold text-foreground-950">
                  {name} connected
                </p>
                <p className="text-xs text-foreground-600">
                  The AI can now apply on your behalf.
                </p>
              </div>
            )}

            {/* ---- 2. Code-free connect (primary) ---- */}
            {mode === "direct" && !connected && (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-100 text-primary-900 flex-shrink-0">
                    <i className="ri-flashlight-line text-lg"></i>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground-900">
                      One-click connect
                    </h4>
                    <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
                      {extensionName} is installed, so there&apos;s nothing to copy. Make
                      sure you&apos;re logged into {name} in your browser, then connect.
                    </p>
                  </div>
                </div>

                {directState === "error" && (
                  <div className="flex items-start gap-2 text-xs text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                    <i className="ri-error-warning-line mt-0.5"></i>
                    <span>{directError}</span>
                  </div>
                )}

                <button
                  onClick={handleDirectConnect}
                  disabled={directState === "connecting"}
                  className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {directState === "connecting" ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Connecting…
                    </>
                  ) : (
                    <>
                      <i className="ri-link"></i>
                      Connect {name}
                    </>
                  )}
                </button>

                <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
                  <i className="ri-shield-check-line text-sm mt-0.5"></i>
                  <span>cookies only, never your password.</span>
                </div>
              </div>
            )}

            {/* ---- Extension not installed ---- */}
            {mode === "absent" && !connected && (
              <div className="space-y-5">
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-secondary-100 text-secondary-900">
                    <i className="ri-puzzle-2-line text-xl"></i>
                  </div>
                  <div>
                    {EXTENSION_STORE_READY ? (
                      <>
                        <h4 className="text-sm font-semibold text-foreground-900">
                          Install {extensionName}
                        </h4>
                        <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
                          Install the extension to link {name} with one click — no codes to copy.
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-sm font-semibold text-foreground-900">
                          Connect {name} with a pairing code
                        </h4>
                        <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
                          The one-click browser extension is in review on the Chrome Web Store.
                          Until it&apos;s live, connect {name} in a few seconds with a pairing
                          code — nothing to install.
                        </p>
                      </>
                    )}
                  </div>
                  {EXTENSION_STORE_READY && EXTENSION_STORE_URL ? (
                    <a
                      href={EXTENSION_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-chrome-line"></i>
                      Install {extensionName}
                    </a>
                  ) : (
                    <button
                      onClick={() => setMode("code")}
                      className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-link"></i>
                      Connect with a pairing code
                    </button>
                  )}
                </div>

                {EXTENSION_STORE_READY ? (
                  <button
                    onClick={() => setMode("code")}
                    className="w-full text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                  >
                    Use a pairing code instead
                  </button>
                ) : (
                  <p className="text-center text-xs text-foreground-500">
                    It&apos;ll be one-click once the extension is approved.
                  </p>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
                  <i className="ri-shield-check-line text-sm mt-0.5"></i>
                  <span>cookies only, never your password.</span>
                </div>
              </div>
            )}

            {/* ---- 3. Clearer pairing-code fallback ---- */}
            {mode === "code" && !connected && (
              <div className="space-y-5">
                {phase === "starting" && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground-500">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Starting secure pairing…
                  </div>
                )}

                {phase === "error" && (
                  <div className="space-y-4 text-center py-8">
                    <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-accent-100 text-accent-900">
                      <i className="ri-error-warning-line text-xl"></i>
                    </div>
                    <p className="text-sm text-foreground-700">{errorMsg}</p>
                    <button
                      onClick={start}
                      className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-refresh-line"></i>
                      Try again
                    </button>
                  </div>
                )}

                {phase === "expired" && (
                  <div className="space-y-4 text-center py-8">
                    <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-accent-100 text-accent-900">
                      <i className="ri-time-line text-xl"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground-900">Code expired</p>
                      <p className="text-xs text-foreground-500 mt-1">
                        Start again to get a fresh pairing code.
                      </p>
                    </div>
                    <button
                      onClick={start}
                      className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-refresh-line"></i>
                      Start again
                    </button>
                  </div>
                )}

                {phase === "pending" && intent && (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-foreground-600 uppercase tracking-wide">
                          Your pairing code
                        </span>
                        <span className="text-xs font-semibold text-foreground-500 whitespace-nowrap">
                          Expires in {formatCountdown(remaining)}
                        </span>
                      </div>
                      <button
                        onClick={copyCode}
                        className="mt-2 w-full flex items-center justify-between gap-3 rounded-xl bg-background-100 border border-background-200 px-4 py-4 hover:bg-background-200 transition-colors cursor-pointer"
                      >
                        <code className="font-mono text-2xl font-semibold text-foreground-950 tracking-[0.28em]">
                          {intent.code}
                        </code>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 whitespace-nowrap">
                          <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
                          {copied ? "Copied ✓" : "Copy"}
                        </span>
                      </button>
                      <p className="text-[11px] text-foreground-500 mt-1.5">
                        Already on your clipboard — just paste it in step 3.
                      </p>
                    </div>

                    <ol className="space-y-2">
                      {steps.map((step) => (
                        <li
                          key={step.n}
                          className="flex items-center gap-3 rounded-lg bg-background-100 border border-background-200 px-3 py-2.5"
                        >
                          <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 text-primary-900 text-xs font-semibold flex-shrink-0">
                            {step.n}
                          </span>
                          <span className="text-sm text-foreground-800">{step.text}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="flex items-center gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
                      <i className="ri-loader-4-line animate-spin flex-shrink-0"></i>
                      <span>Waiting for {name}… it flips to connected on its own.</span>
                    </div>

                    <a
                      href={loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold text-foreground-700 bg-background-50 border border-background-300 px-4 py-2.5 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-external-link-line"></i>
                      Open {name} login first
                    </a>

                    <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed">
                      <i className="ri-shield-check-line text-sm mt-0.5"></i>
                      <span>cookies only, never your password.</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}