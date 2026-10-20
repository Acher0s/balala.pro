"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  type ActionResult,
  createGuide,
  decideRequest,
  requestWriterAccess,
  saveSiteSettings,
  setUserRole,
} from "@/app/studio/actions";
import type { Role } from "@/db/schema";

export const field =
  "w-full rounded-md border bg-fd-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fd-primary";
export const primaryButton =
  "rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground hover:opacity-90 disabled:opacity-50";
export const secondaryButton =
  "rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent disabled:opacity-50";

/** Runs a server action from a form and shows its error, if any. */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (
    fn: () => Promise<ActionResult | undefined>,
    onOk?: () => void,
  ) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (res && !res.ok)
          setError(
            res.error ?? res.problems?.join("\n") ?? "Something went wrong",
          );
        else {
          onOk?.();
          router.refresh();
        }
      } catch (e) {
        // redirect() inside an action surfaces here as a special error; let Next handle it.
        if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
          throw e;
        setError((e as Error).message);
      }
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="whitespace-pre-line text-sm text-red-500">{error}</p>
  ) : null;
}

export function RequestAccessForm() {
  const { pending, error, run } = useAction();
  return (
    <form
      action={(fd) => run(() => requestWriterAccess(fd))}
      className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4"
    >
      <h2 className="font-semibold">Request writer access</h2>
      <label className="flex flex-col gap-1 text-sm">
        What would you like to write about?
        <textarea
          name="message"
          required
          minLength={10}
          rows={4}
          className={field}
        />
      </label>
      <ErrorText error={error} />
      <button
        type="submit"
        disabled={pending}
        className={`${primaryButton} self-start`}
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

export function NewGuideForm() {
  const { pending, error, run } = useAction();
  return (
    <form
      action={(fd) => run(() => createGuide(fd))}
      className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm sm:w-28">
        Type
        <select name="kind" className={field} defaultValue="guide">
          <option value="guide">Guide</option>
          <option value="tool">Tool</option>
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Title
        <input
          name="title"
          required
          className={field}
          placeholder="e.g. Reserved Parking guide"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-48">
        URL name{" "}
        <span className="text-xs text-fd-muted-foreground">(optional)</span>
        <input name="slug" className={field} placeholder="from the title" />
      </label>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Creating…" : "Create"}
      </button>
      <ErrorText error={error} />
    </form>
  );
}

export function RequestDecision({ id }: { id: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={primaryButton}
        onClick={() => run(() => decideRequest(id, true))}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        className={secondaryButton}
        onClick={() => run(() => decideRequest(id, false))}
      >
        Deny
      </button>
      <ErrorText error={error} />
    </span>
  );
}

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex items-center gap-2">
      <select
        defaultValue={role}
        disabled={disabled || pending}
        className={`${field} w-auto`}
        onChange={(e) => run(() => setUserRole(userId, e.target.value as Role))}
      >
        <option value="none">No access</option>
        <option value="writer">Writer</option>
        <option value="admin">Admin</option>
      </select>
      <ErrorText error={error} />
    </span>
  );
}

export function SiteSettingsForm({
  siteName,
  homeIntro,
}: {
  siteName: string;
  homeIntro: string;
}) {
  const { pending, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={(fd) =>
        run(
          () =>
            saveSiteSettings({
              siteName: String(fd.get("siteName")),
              homeIntro: String(fd.get("homeIntro")),
            }),
          () => setSaved(true),
        )
      }
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Site name
        <input
          name="siteName"
          defaultValue={siteName}
          required
          className={field}
          onChange={() => setSaved(false)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Home page introduction
        <textarea
          name="homeIntro"
          defaultValue={homeIntro}
          rows={4}
          className={field}
          onChange={() => setSaved(false)}
        />
      </label>
      <ErrorText error={error} />
      <span className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-fd-muted-foreground">Saved</span>
        )}
      </span>
    </form>
  );
}

export function Panel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
