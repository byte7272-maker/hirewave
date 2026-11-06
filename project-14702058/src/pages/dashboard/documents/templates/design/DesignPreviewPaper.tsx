import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  PAPER_MIN_HEIGHT,
  PAPER_WIDTH,
} from "@/pages/dashboard/documents/templates/themes/paper";

interface DesignPreviewPaperProps {
  /** Renders the FULL-SIZE A4 paper (794px wide). Invoked every paint. */
  render: () => ReactNode;
  /**
   * When set, the paper is scaled to this exact font stack (applied through the
   * `--doc-font` variable, matching the editor's font-swap mechanism).
   */
  fontStack?: string;
  /** Fixed frame height (px) — makes the paper scroll vertically. Omit to size to fit. */
  frameHeight?: number;
  className?: string;
}

/**
 * Renders a template at true A4 width, then scales it to fit its container with a
 * CSS transform — so a user's own résumé can be shown in any design without the
 * layout collapsing. The measured width drives the scale, so it works at both
 * thumbnail and full-preview sizes.
 */
export default function DesignPreviewPaper({
  render,
  fontStack,
  frameHeight,
  className,
}: DesignPreviewPaperProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () =>
      setWidth((prev) => (Math.abs(prev - el.clientWidth) > 1 ? el.clientWidth : prev));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / PAPER_WIDTH : 0;
  const paperHeight = PAPER_MIN_HEIGHT * scale;

  return (
    <div
      ref={frameRef}
      className={className}
      style={
        frameHeight
          ? { height: frameHeight, overflowY: "auto", overflowX: "hidden", scrollbarGutter: "stable" }
          : undefined
      }
    >
      {scale > 0 && (
        <div style={{ width, height: frameHeight ? paperHeight : undefined, overflow: "hidden" }}>
          <div
            className={fontStack ? "hw-doc-font" : undefined}
            style={
              {
                width: PAPER_WIDTH,
                height: PAPER_MIN_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                ...(fontStack ? { "--doc-font": fontStack } : {}),
              } as CSSProperties
            }
          >
            {render()}
          </div>
        </div>
      )}
    </div>
  );
}