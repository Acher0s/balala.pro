import type { ReactNode } from "react";
import { isSkillLevel, LEVEL_INFO, LEVELS } from "./levels";

/**
 * Marks part of a guide as beginner, intermediate or advanced, so readers can see at a glance
 * what's aimed at their skill level. Purely informative: nothing is hidden.
 *
 *   <Level of="beginner">
 *
 *   ## How to play
 *   …
 *
 *   </Level>
 */
export function Level({ of, children }: { of: string; children: ReactNode }) {
  if (!isSkillLevel(of))
    throw new Error(`<Level of="${of}"> must be one of: ${LEVELS.join(", ")}`);
  const { label, colour } = LEVEL_INFO[of];
  return (
    <section
      className="relative my-6 border-l-4 pl-4"
      style={{ borderColor: colour }}
      data-level={of}
    >
      <span
        className="not-prose absolute -top-1 right-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
        style={{ background: colour }}
      >
        {label}
      </span>
      {children}
    </section>
  );
}
