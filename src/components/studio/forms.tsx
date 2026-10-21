"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  type ActionResult,
  createGuide,
  decideRequest,
  importPages,
  requestWriterAccess,
  saveSiteSettings,
  setUserRole,
} from "@/app/studio/actions";
import type { Role } from "@/db/schema";
import { EXAMPLE_ANNOUNCEMENT } from "@/lib/announcement-example";
import type { ImportPage, ImportStatus } from "@/lib/content-import";
import { ROLE_LABELS } from "@/lib/roles";

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
      <h2 className="font-semibold">Request author access</h2>
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
        <option value="none">{ROLE_LABELS.none} (no access)</option>
        <option value="writer">{ROLE_LABELS.writer}</option>
        <option value="admin">{ROLE_LABELS.admin}</option>
      </select>
      <ErrorText error={error} />
    </span>
  );
}

export function SiteSettingsForm({
  siteName,
  homeIntro,
  announcement: initialAnnouncement,
}: {
  siteName: string;
  homeIntro: string;
  announcement: string;
}) {
  const { pending, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  return (
    <form
      action={(fd) =>
        run(
          () =>
            saveSiteSettings({
              siteName: String(fd.get("siteName")),
              homeIntro: String(fd.get("homeIntro")),
              announcement,
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between gap-2">
          Home page announcement
          {!announcement && (
            <button
              type="button"
              className="text-xs underline"
              onClick={() => {
                setAnnouncement(EXAMPLE_ANNOUNCEMENT);
                setSaved(false);
              }}
            >
              Use example text
            </button>
          )}
        </span>
        <textarea
          value={announcement}
          rows={10}
          placeholder="Leave empty for no announcement."
          className={`${field} font-mono`}
          onChange={(e) => {
            setAnnouncement(e.target.value);
            setSaved(false);
          }}
        />
        <span className="text-xs text-fd-muted-foreground">
          Shown at the top of the home page. Uses the same markup as guides.
        </span>
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

const IMPORT_STATUS: Record<ImportStatus, string> = {
  new: "New",
  same: "Draft up to date",
  changed: "Replaces your draft",
  conflict: "Slug used by another page",
};

/**
 * One content pack: pick pages and import them as drafts. New pages are ticked; pages whose
 * draft differs from the file aren't, so edits made on the site aren't replaced by accident.
 */
export function ImportPackForm({
  id,
  title,
  section,
  pages,
}: {
  id: string;
  title: string;
  section: string;
  pages: Omit<ImportPage, "source">[];
}) {
  const { pending, error, run } = useAction();
  const importable = (p: Omit<ImportPage, "source">) =>
    p.status === "new" || p.status === "changed";
  const [chosen, setChosen] = useState(
    () => new Set(pages.filter((p) => p.status === "new").map((p) => p.slug)),
  );
  const [done, setDone] = useState(false);
  const toggle = (slug: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  return (
    <form
      action={() =>
        run(
          () => importPages(id, [...chosen]),
          () => {
            setChosen(new Set());
            setDone(true);
          },
        )
      }
      className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4"
    >
      <div>
        <h2 className="font-semibold">{title}</h2>
        {section && (
          <p className="text-sm text-fd-muted-foreground">Section: {section}</p>
        )}
      </div>
      <ul className="flex flex-col divide-y text-sm">
        {pages.map((p) => (
          <li key={p.slug} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              aria-label={`Import ${p.title}`}
              disabled={!importable(p)}
              checked={chosen.has(p.slug)}
              onChange={() => toggle(p.slug)}
            />
            <span className="w-10 shrink-0 text-xs uppercase text-fd-muted-foreground">
              {p.kind}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {p.id ? (
                <a
                  href={`/studio/guides/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.title}
                </a>
              ) : (
                <span className="font-medium">{p.title}</span>
              )}
              {p.published && (
                <span className="ml-2 text-xs text-fd-muted-foreground">
                  Live
                </span>
              )}
            </span>
            <span
              className={
                p.status === "changed" || p.status === "conflict"
                  ? "text-xs text-amber-600 dark:text-amber-400"
                  : "text-xs text-fd-muted-foreground"
              }
            >
              {IMPORT_STATUS[p.status]}
            </span>
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
      <span className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || chosen.size === 0}
          className={primaryButton}
        >
          {pending
            ? "Importing…"
            : `Import ${chosen.size} ${chosen.size === 1 ? "page" : "pages"}`}
        </button>
        {done && (
          <span className="text-sm text-fd-muted-foreground">
            Imported as drafts. Open a page to review and publish it.
          </span>
        )}
      </span>
    </form>
  );
}
