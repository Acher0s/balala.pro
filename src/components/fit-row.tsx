"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Keeps its children on one line, shrinking them all evenly when the line is wider than the
 * space it has (for <CardRow singleRow>). Hover cards inside are scaled back up so their text
 * stays readable, and shrunk sprites are smoothed (shrinking pixel art pixel by pixel looks
 * jagged).
 */
export function FitRow({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useEffect(() => {
    const box = outer.current;
    const row = inner.current;
    if (!box || !row) return;
    const measure = () => {
      // Transforms don't change offset sizes, so these are the row's natural size.
      const scale = Math.min(1, box.clientWidth / row.offsetWidth);
      setFit({ scale, height: row.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const shrunk = fit.scale < 1;
  return (
    <div
      ref={outer}
      className="min-w-0 flex-1 overflow-x-clip"
      style={shrunk ? { height: fit.height } : undefined}
    >
      <div
        ref={inner}
        data-shrunk={shrunk || undefined}
        className="flex w-max origin-top-left flex-nowrap gap-3 data-shrunk:[&_img]:[image-rendering:auto]!"
        style={
          {
            transform: shrunk ? `scale(${fit.scale})` : undefined,
            "--card-scale": fit.scale,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
