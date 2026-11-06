import { useEffect, type ReactNode } from "react";
import Card from "@/components/base/Card";
import Button from "@/components/base/Button";

export type ModalSize = "sm" | "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional Remix Icon shown in the header tile. */
  icon?: string;
  /** Panel width. Defaults to `md`. */
  size?: ModalSize;
}

/**
 * The design system's dialog. It composes the shared `Card` surface (rounded,
 * hairline bordered, shadow-free) and a `Button` for the close affordance, so
 * every modal in the app reads as the same material as the cards behind it.
 * Escape closes, and the page behind never scrolls while it's open.
 */
export default function Modal({ title, onClose, children, icon, size = "md" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="animate-fade absolute inset-0 bg-foreground-950/45 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <Card
        tone={icon ? "primary" : "none"}
        surface="plain"
        className={`animate-pop relative w-full ${SIZE[size]} flex flex-col max-h-[90vh]`}
      >
        <div className="flex flex-col max-h-[90vh]">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && (
                <div className="hw-tile rounded-tile bg-primary-100 text-primary-700">
                  <i className={`${icon} text-lg`} aria-hidden="true"></i>
                </div>
              )}
              <h3 className="font-heading text-lg font-medium tracking-tight text-foreground-950 truncate">
                {title}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="ri-close-line"
              onClick={onClose}
              aria-label="Close"
              className="!p-0 w-8 h-8 flex-shrink-0"
            />
          </div>
          <div className="p-5 overflow-y-auto">{children}</div>
        </div>
      </Card>
    </div>
  );
}