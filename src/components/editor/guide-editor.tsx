"use client";

import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  deleteGuide,
  publishGuide,
  restoreRevision,
  saveDraft,
  unpublishGuide,
  updateGuideSettings,
} from "@/app/studio/actions";
import { uploadMedia } from "@/app/studio/media-actions";
import {
  field,
  primaryButton,
  secondaryButton,
} from "@/components/studio/forms";
import { editorAppearance } from "./editor-theme";
import {
  READY_MESSAGE,
  REFRESH_MESSAGE,
  SCROLL_MESSAGE,
} from "./preview-scroll-sync";
import {
  type CatalogEntry,
  cardMarkup,
  KIND_LABELS,
  SNIPPETS,
} from "./snippets";

type SaveState = "saved" | "unsaved" | "saving" | "error" | "outdated";
type Tab = "cards" | "blocks" | "settings" | "history";

const AUTOSAVE_MS = 600;
/** How often unsaved changes are saved (or a failed save retried) no matter what. */
const SAFETY_SAVE_MS = 10_000;
/** A save that takes longer than this counts as failed (and is retried). */
const SAVE_TIMEOUT_MS = 20_000;
const STUDIO = "/studio";
/** Same limit as the details block's `icon` (lib/mdx/compile.ts, which is server-only). */
const MAX_ICONS = 3;

interface EditorGuide {
  id: string;
  slug: string;
  section: string;
  position: number;
  /** The main guide this is a part of. */
  parentId: string | null;
  /** Other guides are parts of this one, so it can't become a part itself. */
  hasParts: boolean;
  authorId: string | null;
  status: "draft" | "published" | "changed";
  kind: "guide" | "tool";
  /** Public URL, e.g. /guides/reserved-parking */
  url: string;
}

export function GuideEditor({
  guide,
  initialSource,
  parentOptions,
  catalog,
  revisions,
  authors,
  isAdmin,
  tools,
  tierLists,
}: {
  guide: EditorGuide;
  initialSource: string;
  /** Main guides this one can become a part of. */
  parentOptions: { id: string; title: string }[];
  catalog: CatalogEntry[];
  revisions: { id: string; at: string; by: string }[];
  authors: { id: string; name: string }[];
  isAdmin: boolean;
  /** Published tools a guide can embed (empty when editing a tool). */
  tools: { slug: string; title: string }[];
  /** Published tier lists anyone made, for embedding. */
  tierLists: { id: string; title: string; owner: string }[];
}) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState(guide.status);
  const [tab, setTab] = useState<Tab>("cards");
  const [publishing, startPublish] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const syncRef = useRef(true);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadRef = useRef<(files: File[]) => void>(() => {});
  // Every edit bumps editVersion; a save records the version it sent. The draft is only
  // "saved" when the server has the latest version.
  const editVersion = useRef(0);
  const savedVersion = useRef(0);
  const saving = useRef(false);
  // Set once the site has been redeployed under this open page: saves can't succeed until
  // the page is reloaded.
  const outdated = useRef(false);
  const backupKey = `bmpu-guide-backup:${guide.id}`;
  /** Text kept in this browser that the server may not have (e.g. it was down). */
  const [backup, setBackup] = useState<{ source: string; at: number } | null>(
    null,
  );

  /** Tells the preview which source line is at the top of the editor (fractional for smoothness). */
  const sendScroll = useCallback(() => {
    const v = view.current;
    const win = preview.current?.contentWindow;
    if (!syncRef.current || !v || !win) return;
    const block = v.lineBlockAtHeight(v.scrollDOM.scrollTop);
    const fraction =
      block.height > 0 ? (v.scrollDOM.scrollTop - block.top) / block.height : 0;
    const line =
      v.state.doc.lineAt(block.from).number +
      Math.min(Math.max(fraction, 0), 1);
    win.postMessage({ type: SCROLL_MESSAGE, line }, window.location.origin);
  }, []);

  // The preview asks for the position when it (re)loads, e.g. after each save.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin !== window.location.origin ||
        e.source !== preview.current?.contentWindow
      )
        return;
      if ((e.data as { type?: string })?.type === READY_MESSAGE) {
        // The preview's content is on screen: show it (see the fade-in below).
        setPreviewLoaded(true);
        sendScroll();
      }
    };
    window.addEventListener("message", onMessage);
    // The preview may already have loaded before this page finished starting up.
    const doc = preview.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.body?.childElementCount)
      setPreviewLoaded(true);
    return () => window.removeEventListener("message", onMessage);
  }, [sendScroll]);

  /** Re-renders the preview in place (no full page reload), keeping its scroll position. */
  const reloadPreview = useCallback(() => {
    preview.current?.contentWindow?.postMessage(
      { type: REFRESH_MESSAGE },
      window.location.origin,
    );
  }, []);

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const source = view.current?.state.doc.toString();
    // One save at a time; the periodic check below picks up anything typed meanwhile.
    if (source === undefined || saving.current || outdated.current) return;
    const version = editVersion.current;
    saving.current = true;
    setState("saving");
    try {
      // A stuck server must not block retries forever.
      const res = await Promise.race([
        saveDraft(guide.id, source),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Save timed out")),
            SAVE_TIMEOUT_MS,
          ),
        ),
      ]);
      savedVersion.current = Math.max(savedVersion.current, version);
      setProblems(res.problems ?? []);
      setStatus((s) => (s === "published" ? "changed" : s));
      reloadPreview();
      if (editVersion.current === version) {
        setState("saved");
        // The server has everything: the browser backup is no longer needed.
        try {
          localStorage.removeItem(backupKey);
        } catch {
          // ignore
        }
      } else setState("unsaved");
    } catch (e) {
      // A newer version of the site is running; this page's save action no longer exists.
      if (
        e instanceof Error &&
        /Server Action .* was not found/.test(e.message)
      ) {
        outdated.current = true;
        setState("outdated");
        return;
      }
      // Server unreachable or restarting: keep the text in the browser and retry.
      setState("error");
    } finally {
      saving.current = false;
    }
  }, [guide.id, reloadPreview, backupKey]);

  // Safety net: every 10 seconds, save anything the server doesn't have yet. This covers
  // long stretches of typing without a pause and retries after a failed save.
  useEffect(() => {
    const id = setInterval(() => {
      if (editVersion.current !== savedVersion.current && !saving.current)
        void save();
    }, SAFETY_SAVE_MS);
    return () => clearInterval(id);
  }, [save]);

  // A backup from an earlier visit that differs from the server's draft: offer to restore it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: checked once, against the draft the page opened with
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const found = JSON.parse(raw) as { source: string; at: number };
      if (found.source !== initialSource) setBackup(found);
      else localStorage.removeItem(backupKey);
    } catch {
      // No usable backup.
    }
  }, []);

  // CodeMirror is created once; later content changes come from typing or the insert panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialSource is only the starting document
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      doc: initialSource,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        // Paste or drop an image/GIF into the text to upload it.
        EditorView.domEventHandlers({
          paste: (e) => {
            const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length === 0) return false;
            e.preventDefault();
            uploadRef.current(files);
            return true;
          },
          drop: (e) => {
            const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length === 0) return false;
            e.preventDefault();
            uploadRef.current(files);
            return true;
          },
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void save();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          editVersion.current++;
          setState((s) => (s === "error" || s === "outdated" ? s : "unsaved"));
          // Keep a copy in the browser until the server confirms it has this text.
          try {
            localStorage.setItem(
              backupKey,
              JSON.stringify({
                source: u.state.doc.toString(),
                at: Date.now(),
              }),
            );
          } catch {
            // Storage full or blocked: the server save still happens.
          }
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
        }),
        ...editorAppearance,
      ],
    });
    view.current = editor;
    // At most ~60 updates a second while scrolling, plus one at the end.
    const onScroll = () => {
      if (scrollTimer.current !== null) return;
      scrollTimer.current = setTimeout(() => {
        scrollTimer.current = null;
        sendScroll();
      }, 16);
    };
    editor.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    // Check the draft once on open so problems show right away.
    void saveDraft(guide.id, initialSource).then((r) =>
      setProblems(r.problems ?? []),
    );
    return () => {
      editor.scrollDOM.removeEventListener("scroll", onScroll);
      editor.destroy();
    };
  }, [save, sendScroll]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      // After a redeploy the text is in the browser backup, which the reloaded page offers back.
      if (state !== "saved" && state !== "outdated") e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [state]);

  /**
   * Inserts at the cursor; `wrap` receives the selected text (or "") and returns the replacement.
   * A cursor inside the --- details block (e.g. the editor was never clicked) would break it,
   * so in that case the insert goes at the end of the guide instead.
   */
  const insert = useCallback((wrap: (selected: string) => string) => {
    const v = view.current;
    if (!v) return;
    let { from, to } = v.state.selection.main;
    const doc = v.state.doc.toString();
    const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(doc);
    if (frontmatter && from < frontmatter[0].length) {
      from = to = doc.length;
    }
    const text = wrap(v.state.sliceDoc(from, to));
    v.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    v.focus();
  }, []);

  /**
   * Writes the page icon(s) into the details block: `icon: kind:id`, or a list for several.
   * "add" keeps the icons already there (up to 3, the first stays the main one); otherwise this
   * card replaces them.
   */
  const setIcon = useCallback((entry: CatalogEntry, add: boolean) => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc.toString();
    const ref = `${entry.kind}:${entry.id}`;
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(doc);
    const existing = fm ? /^icon:(.*)$/m.exec(fm[1]) : null;
    const current = existing
      ? existing[1]
          .replace(/[[\]]/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    let icons = [ref];
    if (add) {
      if (current.includes(ref)) {
        setNotice(`${entry.name} is already a page icon`);
        return;
      }
      if (current.length >= MAX_ICONS) {
        setNotice(`A page can have up to ${MAX_ICONS} icons`);
        return;
      }
      icons = [...current, ref];
    }
    const line = `icon: ${icons.length === 1 ? icons[0] : `[${icons.join(", ")}]`}`;
    let change: { from: number; to?: number; insert: string };
    if (!fm) change = { from: 0, insert: `---\n${line}\n---\n\n` };
    else {
      const yamlStart = fm[0].indexOf("\n") + 1;
      change = existing
        ? {
            from: yamlStart + existing.index,
            to: yamlStart + existing.index + existing[0].length,
            insert: line,
          }
        : { from: yamlStart + fm[1].length, insert: `\n${line}` };
    }
    v.dispatch({ changes: change });
    setNotice(
      icons.length === 1
        ? `Page icon set to ${entry.name}`
        : `Added ${entry.name} to the page icons (${icons.length} of ${MAX_ICONS})`,
    );
  }, []);

  const [uploading, setUploading] = useState(false);
  /** Uploads images/GIFs and inserts them as Markdown images at the cursor. */
  const uploadImages = useCallback(
    async (files: File[]) => {
      setUploading(true);
      setNotice(null);
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await uploadMedia(form).catch((e: Error) => ({
          ok: false,
          url: undefined,
          error: e.message,
        }));
        if (res.ok && res.url) {
          const alt =
            file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "") || "image";
          insert(() => `\n![${alt}](${res.url})\n`);
        } else setNotice(res.error ?? "Upload failed");
      }
      setUploading(false);
    },
    [insert],
  );
  uploadRef.current = (files) => void uploadImages(files);

  const publish = () =>
    startPublish(async () => {
      if (timer.current) clearTimeout(timer.current);
      const source = view.current?.state.doc.toString() ?? "";
      const res = await publishGuide(guide.id, source);
      setProblems(res.problems ?? []);
      if (res.ok) {
        setStatus("published");
        setState("saved");
        setNotice("Published");
        router.refresh();
      } else setNotice("Fix the problems below before publishing");
    });

  const saveLabel = {
    saved: "Draft saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    error: "Save failed, retrying… (your text is kept in this browser)",
    outdated:
      "The site was updated. Reload to keep saving (your text is kept in this browser)",
  }[state];
  const statusLabel = {
    draft: "Not published",
    published: "Live",
    changed: "Live · draft has changes",
  }[status];

  return (
    <div className="flex h-[calc(100vh-41px)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
        <Link
          href={STUDIO}
          className="text-fd-muted-foreground hover:text-fd-foreground"
        >
          ← Guides
        </Link>
        <span className="font-semibold">{guide.url}</span>
        <span className="rounded-full border px-2 py-0.5 text-xs">
          {statusLabel}
        </span>
        <span
          className={
            state === "error" || state === "outdated"
              ? "text-red-500"
              : "text-fd-muted-foreground"
          }
          aria-live="polite"
        >
          {saveLabel}
        </span>
        {state === "outdated" && (
          <button
            type="button"
            className="rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-fd-accent"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        )}
        {notice && <span className="text-fd-muted-foreground">{notice}</span>}
        <span className="ml-auto flex items-center gap-2">
          <label
            className="hidden items-center gap-1.5 text-fd-muted-foreground lg:flex"
            title="Scroll the preview along with the editor"
          >
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => {
                syncRef.current = e.target.checked;
                setSyncScroll(e.target.checked);
                if (e.target.checked) sendScroll();
              }}
            />
            Sync scroll
          </label>
          {status !== "draft" && (
            <a
              href={guide.url}
              target="_blank"
              rel="noreferrer"
              className={secondaryButton}
            >
              View live ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => void save()}
            className={secondaryButton}
          >
            Save draft <kbd className="text-xs opacity-70">Ctrl+S</kbd>
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || problems.length > 0}
            className={primaryButton}
            title={
              problems.length
                ? "Fix the problems first"
                : "Make this version live"
            }
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </span>
      </header>

      {backup && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <span>
            This browser has unsaved text for this guide from{" "}
            {new Date(backup.at).toLocaleString()}.
          </span>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              const v = view.current;
              if (v)
                v.dispatch({
                  changes: {
                    from: 0,
                    to: v.state.doc.length,
                    insert: backup.source,
                  },
                });
              setBackup(null);
            }}
          >
            Restore it
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              try {
                localStorage.removeItem(backupKey);
              } catch {
                // ignore
              }
              setBackup(null);
            }}
          >
            Discard
          </button>
        </div>
      )}

      {problems.length > 0 && (
        <div className="max-h-28 overflow-y-auto border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm">
          <p className="font-medium">
            {problems.length} problem{problems.length === 1 ? "" : "s"}, the
            draft is saved but can't be published yet:
          </p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
        <div ref={host} className="min-h-[40vh] overflow-hidden border-r" />
        {/* Hidden until loaded: an iframe is white before its page arrives, which flashes in dark mode. */}
        <div className="hidden h-full border-r bg-fd-background lg:block">
          <iframe
            ref={preview}
            title="Preview"
            src={`/preview/${guide.id}`}
            onLoad={() => setPreviewLoaded(true)}
            className={`h-full w-full transition-opacity duration-150 ${previewLoaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
        <aside className="flex min-h-0 flex-col border-t lg:border-t-0">
          <div className="grid grid-cols-4 border-b text-xs">
            {(
              [
                ["cards", "Cards"],
                ["blocks", "Blocks"],
                ["settings", "Settings"],
                ["history", "History"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-2 py-2 font-medium ${tab === t ? "border-b-2 border-fd-primary" : "text-fd-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "cards" && (
              <CardPicker
                catalog={catalog}
                onPick={(entry, mode) =>
                  mode === "icon" || mode === "add-icon"
                    ? setIcon(entry, mode === "add-icon")
                    : insert((sel) =>
                        cardMarkup(entry, {
                          selected: sel,
                          asCard: mode === "card",
                        }),
                      )
                }
              />
            )}
            {tab === "blocks" && (
              <ul className="flex flex-col gap-2">
                {SNIPPETS.map((s) => (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() =>
                        insert((sel) =>
                          s.text.replace("$SELECTION", sel || "Write here"),
                        )
                      }
                      className="w-full rounded-lg border p-2 text-left text-sm hover:bg-fd-accent"
                    >
                      <span className="block font-medium">{s.label}</span>
                    </button>
                  </li>
                ))}
                <li className="mt-2 flex flex-col gap-2 border-t pt-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
                    Image or GIF
                  </span>
                  <label className="w-full cursor-pointer rounded-lg border p-2 text-sm hover:bg-fd-accent">
                    <span className="block font-medium">
                      {uploading ? "Uploading…" : "Upload image"}
                    </span>
                    <input
                      type="file"
                      accept="image/gif,image/png,image/jpeg,image/webp"
                      multiple
                      className="sr-only"
                      disabled={uploading}
                      onChange={(e) => {
                        const files = [...(e.target.files ?? [])];
                        e.target.value = "";
                        if (files.length) void uploadImages(files);
                      }}
                    />
                  </label>
                </li>
                <TierListPicker
                  lists={tierLists}
                  onPick={(id) =>
                    insert(
                      () => `
<TierList id="${id}" />
`,
                    )
                  }
                />
                {guide.kind === "guide" && (
                  <li className="mt-2 flex flex-col gap-2 border-t pt-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
                      Embed a tool
                    </span>
                    {tools.length === 0 && (
                      <span className="text-xs text-fd-muted-foreground">
                        No published tools yet.
                      </span>
                    )}
                    {tools.map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() =>
                          insert(() => `\n<Tool id="${t.slug}" />\n`)
                        }
                        className="w-full rounded-lg border p-2 text-left text-sm hover:bg-fd-accent"
                      >
                        <span className="block font-medium">{t.title}</span>
                        <span className="block text-xs text-fd-muted-foreground">
                          /tools/{t.slug}
                        </span>
                      </button>
                    ))}
                  </li>
                )}
              </ul>
            )}
            {tab === "settings" && (
              <SettingsPanel
                guide={guide}
                parentOptions={parentOptions}
                authors={authors}
                isAdmin={isAdmin}
                published={status !== "draft"}
                onUnpublished={() => setStatus("draft")}
              />
            )}
            {tab === "history" && (
              <HistoryPanel guideId={guide.id} revisions={revisions} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SettingsPanel({
  guide,
  parentOptions,
  authors,
  isAdmin,
  published,
  onUnpublished,
}: {
  guide: EditorGuide;
  parentOptions: { id: string; title: string }[];
  authors: { id: string; name: string }[];
  isAdmin: boolean;
  published: boolean;
  onUnpublished: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [parentId, setParentId] = useState(guide.parentId ?? "");

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* onSubmit, not a form action: React resets a form after an action, which would show
          the fields' old values (and "Part of" as Nothing) although the new ones were saved. */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const res = await updateGuideSettings(guide.id, {
              slug: String(fd.get("slug")),
              section: String(fd.get("section") ?? guide.section),
              position: Number(fd.get("position")),
              parentId: guide.kind === "guide" ? parentId || null : undefined,
              authorId: isAdmin
                ? String(fd.get("authorId")) || null
                : undefined,
            });
            setMessage(res.ok ? "Saved" : (res.error ?? "Failed"));
            if (res.ok) router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1">
          URL name
          <input name="slug" defaultValue={guide.slug} className={field} />
        </label>
        {guide.kind === "guide" && (
          <label className="flex flex-col gap-1">
            Part of{" "}
            <span className="text-xs text-fd-muted-foreground">
              {guide.hasParts
                ? "Other guides are parts of this one, so it stays a main guide."
                : "Parts aren't listed on the Guides page; readers reach them from the main guide."}
            </span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={guide.hasParts}
              className={field}
            >
              <option value="">Nothing: a main guide</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!parentId && (
          <label className="flex flex-col gap-1">
            Section{" "}
            <span className="text-xs text-fd-muted-foreground">
              Groups guides on the Guides page, e.g. Jokers; empty = top
            </span>
            <input
              name="section"
              defaultValue={guide.section}
              className={field}
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          {parentId ? "Order among the parts" : "Order in section"}
          <input
            name="position"
            type="number"
            defaultValue={guide.position}
            className={field}
          />
        </label>
        {isAdmin && (
          <label className="flex flex-col gap-1">
            Owner
            <select
              name="authorId"
              defaultValue={guide.authorId ?? ""}
              className={field}
            >
              <option value="">Nobody (admins only)</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`${primaryButton} self-start`}
        >
          Save settings
        </button>
        {message && <p className="text-fd-muted-foreground">{message}</p>}
      </form>

      <div className="flex flex-col gap-2 border-t pt-4">
        {published && (
          <button
            type="button"
            disabled={pending}
            className={secondaryButton}
            onClick={() =>
              start(async () => {
                await unpublishGuide(guide.id);
                onUnpublished();
                setMessage("Taken off the site. The draft is kept.");
                router.refresh();
              })
            }
          >
            Unpublish
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-red-500/50 px-3 py-1.5 text-red-600 hover:bg-red-500/10"
          onClick={() => {
            if (
              confirm(
                `Delete ${guide.url} and its whole history? This can't be undone.`,
              )
            ) {
              start(() => deleteGuide(guide.id));
            }
          }}
        >
          Delete {guide.kind}
        </button>
      </div>
    </div>
  );
}

function HistoryPanel({
  guideId,
  revisions,
}: {
  guideId: string;
  revisions: { id: string; at: string; by: string }[];
}) {
  const [pending, start] = useTransition();
  if (revisions.length === 0)
    return (
      <p className="text-sm text-fd-muted-foreground">Not published yet.</p>
    );
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul className="divide-y rounded-lg border">
        {revisions.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 px-2 py-1.5"
          >
            <span>
              {new Date(r.at).toLocaleString()}
              <span className="block text-xs text-fd-muted-foreground">
                by {r.by}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              className="rounded border px-2 py-0.5 text-xs hover:bg-fd-accent"
              onClick={() => {
                if (confirm("Replace the current draft with this version?")) {
                  start(async () => {
                    await restoreRevision(guideId, r.id);
                    window.location.reload();
                  });
                }
              }}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What clicking a card in the picker does. */
type PickMode = "text" | "card" | "icon" | "add-icon";

function CardPicker({
  catalog,
  onPick,
}: {
  catalog: CatalogEntry[];
  onPick: (e: CatalogEntry, mode: PickMode) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CatalogEntry["kind"] | "all">("all");
  const [mode, setMode] = useState<PickMode>("text");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (e) =>
        (kind === "all" || e.kind === kind) &&
        (!q || e.name.toLowerCase().includes(q)),
    );
  }, [catalog, query, kind]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        type="search"
        placeholder="Search cards…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={field}
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className={field}
      >
        <option value="all">All kinds</option>
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1 text-xs">
        Clicking a card
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as PickMode)}
          className={field}
        >
          <option value="text">Inserts its name in the text</option>
          <option value="card">Inserts it as a large card image</option>
          <option value="icon">
            Sets it as the page icon (shown in lists)
          </option>
          <option value="add-icon">
            Adds it to the page icons (up to {MAX_ICONS}, fanned out)
          </option>
        </select>
      </label>
      <ul className="grid grid-cols-3 gap-2">
        {results.map((e) => (
          <li key={`${e.kind}:${e.id}`}>
            <button
              type="button"
              onClick={() => onPick(e, mode)}
              title={`${e.name} (${e.source ?? e.kind})`}
              className="flex w-full flex-col items-center gap-1 rounded-lg p-1 text-center text-[11px] leading-tight hover:bg-fd-accent"
            >
              {e.layers ? (
                // A playing card: its layers stacked, like on the site.
                <span className="relative h-[57px] w-[43px]">
                  {e.layers.map((src) => (
                    // biome-ignore lint/performance/noImgElement: small sprite; smooth scaling avoids jagged pixels
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="absolute inset-0 h-full w-full"
                      loading="lazy"
                    />
                  ))}
                </span>
              ) : (
                // biome-ignore lint/performance/noImgElement: small sprite; smooth scaling avoids jagged pixels
                <img
                  src={e.image}
                  alt=""
                  className="h-[57px] w-auto"
                  loading="lazy"
                />
              )}
              {e.name}
              {e.source && (
                <span className="rounded bg-[#ac3232] px-1 text-[9px] font-bold uppercase text-white">
                  {e.source}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {results.length === 0 && (
        <p className="text-xs text-fd-muted-foreground">No matches</p>
      )}
    </div>
  );
}

function TierListPicker({
  lists,
  onPick,
}: {
  lists: { id: string; title: string; owner: string }[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = lists
    .filter(
      (l) =>
        !q ||
        l.title.toLowerCase().includes(q) ||
        l.owner.toLowerCase().includes(q),
    )
    .slice(0, 30);
  return (
    <li className="mt-2 flex flex-col gap-2 border-t pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
        Embed a tier list
      </span>
      <a
        href="/tierlists/new"
        target="_blank"
        rel="noreferrer"
        className="text-xs underline"
      >
        Make a new tier list ↗
      </a>
      {lists.length > 0 && (
        <input
          type="search"
          placeholder="Search tier lists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={field}
        />
      )}
      {lists.length === 0 && (
        <span className="text-xs text-fd-muted-foreground">
          No published tier lists yet.
        </span>
      )}
      {results.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onPick(l.id)}
          className="w-full rounded-lg border p-2 text-left text-sm hover:bg-fd-accent"
        >
          <span className="block font-medium">{l.title}</span>
          <span className="block text-xs text-fd-muted-foreground">
            by {l.owner}
          </span>
        </button>
      ))}
    </li>
  );
}
