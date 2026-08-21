import { createContext, useCallback, useContext, useState } from "react";

type Kind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}
interface ToastApi {
  push: (message: string, kind?: Kind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<Kind, string> = {
  info: "border-l-primary-500",
  success: "border-l-primary-500",
  error: "border-l-accent-500",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`bg-background-50 border border-background-200 border-l-4 ${STYLES[t.kind]} rounded-lg px-4 py-3 text-sm text-foreground-900 animate-fade-in-up`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
