import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onUndo: () => void | Promise<void>;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast tones map onto the same role tokens as the rest of the system: success
 * is emerald (`primary`), error/attention is coral (`accent`) and info is a quiet
 * neutral. Each toast pairs a tone-tinted icon tile with the canonical card
 * surface — hairline border, rounded-card, no shadow.
 */
const TONES: Record<ToastTone, { icon: string; tile: string }> = {
  success: { icon: "ri-check-line", tile: "bg-primary-100 text-primary-700" },
  error: { icon: "ri-error-warning-line", tile: "bg-accent-100 text-accent-700" },
  info: { icon: "ri-information-line", tile: "bg-background-200 text-foreground-700" },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success", action?: ToastAction) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, tone, action }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] w-full max-w-md px-4 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => {
          const tone = TONES[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-3 w-full rounded-card border border-background-300 bg-background-50 pl-3 pr-4 py-3 animate-fade-in-up"
            >
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-tile flex-shrink-0 ${tone.tile}`}
              >
                <i className={`${tone.icon} text-base`} aria-hidden="true"></i>
              </span>
              <span className="flex-1 text-sm font-medium text-foreground-900 min-w-0">
                {t.message}
              </span>
              {t.action && (
                <button
                  onClick={() => {
                    dismiss(t.id);
                    void t.action?.onUndo();
                  }}
                  className="text-xs font-bold text-primary-700 hover:text-primary-900 underline underline-offset-2 cursor-pointer whitespace-nowrap"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => {} };
  }
  return ctx;
}