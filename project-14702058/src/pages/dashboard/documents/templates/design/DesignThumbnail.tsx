import { useEffect, useRef, useState, type ReactNode } from "react";
import DesignPreviewPaper from "./DesignPreviewPaper";

interface DesignThumbnailProps {
  /** Renders the full-size paper — only called once the tile scrolls into view. */
  render: () => ReactNode;
  fontStack?: string;
  className?: string;
}

/**
 * A lazy A4 thumbnail: the (comparatively costly) template render is deferred
 * until the tile actually enters the viewport, so a tall gallery paints
 * instantly and only renders the cards the user can see.
 */
export default function DesignThumbnail({
  render,
  fontStack,
  className,
}: DesignThumbnailProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return undefined;
    const el = wrapRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  return (
    <div
      ref={wrapRef}
      className={`aspect-[794/1123] w-full overflow-hidden bg-background-100 ${className ?? ""}`}
    >
      {inView ? (
        <DesignPreviewPaper render={render} fontStack={fontStack} />
      ) : (
        <div className="w-full h-full animate-pulse bg-background-200/70" />
      )}
    </div>
  );
}