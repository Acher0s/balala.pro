import type { ReactNode } from "react";

/**
 * Puts its columns side by side when there's room (judged by its own width, so it also works
 * inside an embedded tool), and stacks them otherwise.
 *
 *   <Columns>
 *   <Column>
 *
 *   ## Left
 *
 *   </Column>
 *   <Column>
 *
 *   ## Right
 *
 *   </Column>
 *   </Columns>
 *
 * A calculator can also go straight into Columns without a Column around it.
 */
export function Columns({ children }: { children: ReactNode }) {
  return (
    <div className="@container my-4">
      <div className="grid items-start gap-x-6 @3xl:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

export function Column({ children }: { children: ReactNode }) {
  return <div className="min-w-0 [&>:first-child]:mt-0">{children}</div>;
}
