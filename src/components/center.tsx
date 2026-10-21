import type { ReactNode } from "react";

/**
 * Centres its contents: a card, a row of cards, an image or text.
 *
 *   <Center>
 *     <Joker id="reserved_parking" card />
 *   </Center>
 */
export function Center({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex flex-wrap items-start justify-center gap-3 text-center [&>p]:my-0">
      {children}
    </div>
  );
}
