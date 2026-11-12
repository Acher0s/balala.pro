"use client";

/**
 * Stand-ins for the BMP site's UI kit (shadcn: Card, Badge, Button, Table, Dialog, Tooltip,
 * ScrollArea, TableShell, next/image), so the copied Log Parser views work unchanged here.
 * Same names and the props those views use, styled to fit this site.
 */
import {
  type ButtonHTMLAttributes,
  cloneElement,
  createContext,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/cn";

type Div = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: Div) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-fd-card text-fd-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: Div) {
  return (
    <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />
  );
}
export function CardTitle({ className, ...props }: Div) {
  return (
    <div className={cn("font-semibold leading-tight", className)} {...props} />
  );
}
export function CardContent({ className, ...props }: Div) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "outline"
          ? "border text-fd-foreground"
          : "bg-fd-primary text-fd-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        variant === "outline"
          ? "border bg-fd-background hover:bg-fd-accent"
          : variant === "ghost"
            ? "hover:bg-fd-accent"
            : "bg-fd-primary text-fd-primary-foreground hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function ScrollArea({ className, ...props }: Div) {
  return <div className={cn("overflow-auto", className)} {...props} />;
}

export function TableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-fd-background", className)}>
      {children}
    </div>
  );
}
export function Table({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b last:border-0", className)} {...props} />;
}
export function TableHead({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 px-2 text-left align-middle text-xs font-medium text-fd-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-2 align-middle", className)} {...props} />;
}

/** <Trigger asChild><Button/></Trigger>: the child gets the trigger's handlers. */
function withHandlers(
  child: ReactNode,
  handlers: Record<string, () => void>,
): ReactNode {
  if (!isValidElement(child)) return child;
  const el = child as ReactElement<Record<string, unknown>>;
  return cloneElement(el, handlers);
}

const DialogContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function Dialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}
export function DialogTrigger({
  children,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = useContext(DialogContext);
  return withHandlers(children, { onClick: () => setOpen(true) });
}
export function DialogContent({ className, children }: Div) {
  const { open, setOpen } = useContext(DialogContext);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex w-full max-w-3xl flex-col rounded-xl border bg-fd-background shadow-xl",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 z-10 rounded-md px-2 py-1 text-sm hover:bg-white/10"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
export function DialogHeader({ className, ...props }: Div) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: Div) {
  return <div className={cn("text-lg font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: Div) {
  return <div className={cn("text-sm opacity-80", className)} {...props} />;
}

/** A hover/focus tooltip: the trigger as is, the content shown above it. */
export function Tooltip({ children }: { children: ReactNode }) {
  return <span className="group/tip relative inline-block">{children}</span>;
}
export function TooltipTrigger({
  children,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  return <>{children}</>;
}
export function TooltipContent({ className, children }: Div) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-1 w-max -translate-x-1/2 rounded-md border bg-fd-popover px-2 py-1 text-xs text-fd-popover-foreground opacity-0 shadow-md transition-opacity group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** next/image's default export, as a plain image: the copied views only show local sprites. */
export default function Image({
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  // biome-ignore lint/performance/noImgElement: small local sprites, as next/image was used for
  return <img alt={alt} {...props} />;
}
