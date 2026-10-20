"use client";

import { useRouter } from "next/navigation";
import {
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { deleteTierList, saveTierList } from "@/app/tierlists/actions";
import {
  defaultTiers,
  LIMITS,
  newTierId,
  PRESETS,
  TIER_COLORS,
  type Tier,
  type TierItem,
  type TierListData,
} from "@/lib/tierlist-shared";
import { TierThumbImage } from "./tier-thumb";

const DRAFT_KEY = "bmpu-tierlist-draft";

interface Initial {
  id: string;
  title: string;
  description: string;
  data: TierListData;
  status: "private" | "published";
}

type Target = { tierId: string | "pool"; before?: string };

/**
 * TierMaker-style tier list maker. Drag cards between rows and the unranked pool, or tap a card
 * and then tap where it should go (works on phones). New lists are kept in this browser until saved.
 */
export function TierMaker({
  catalog,
  initial,
  signedIn,
  basePath = "/tierlists",
}: {
  catalog: TierItem[];
  initial?: Initial;
  signedIn: boolean;
  /**
   * Where this maker lives: "/tierlists" on the site, "/studio/tierlists" in the studio.
   * Saving continues at <basePath>/<id>/edit; deleting returns to the list of your tier lists.
   */
  basePath?: string;
}) {
  const editPath = (id: string) => `${basePath}/${id}/edit`;
  const listPath = basePath === "/tierlists" ? "/tierlists/mine" : basePath;
  const router = useRouter();
  const byRef = useMemo(
    () => new Map(catalog.map((c) => [c.ref, c])),
    [catalog],
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tiers, setTiers] = useState<Tier[]>(
    initial?.data.tiers ?? defaultTiers(),
  );
  const [pool, setPool] = useState<string[]>(initial?.data.pool ?? []);
  const [started, setStarted] = useState(!!initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState(initial?.status ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const restored = useRef(false);

  // New lists: restore the draft kept in this browser (e.g. after signing in to save it).
  useEffect(() => {
    if (initial || restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        title: string;
        description: string;
        data: TierListData;
      };
      setTitle(draft.title);
      setDescription(draft.description);
      setTiers(draft.data.tiers);
      setPool(draft.data.pool);
      setStarted(true);
      setMessage("Your unsaved tier list was restored.");
    } catch {
      // No usable draft.
    }
  }, [initial]);

  useEffect(() => {
    if (initial || !started) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ title, description, data: { tiers, pool } }),
      );
    } catch {
      // Storage blocked: the list still works, it just isn't kept.
    }
  }, [initial, started, title, description, tiers, pool]);

  const count = tiers.reduce((n, t) => n + t.items.length, 0) + pool.length;

  // --- Moving cards -------------------------------------------------------

  function moveItem(ref: string, target: Target) {
    if (target.before === ref) return;
    const strip = (list: string[]) => list.filter((r) => r !== ref);
    const insert = (list: string[]) => {
      const i = target.before ? list.indexOf(target.before) : -1;
      return i === -1
        ? [...list, ref]
        : [...list.slice(0, i), ref, ...list.slice(i)];
    };
    setTiers((ts) =>
      ts.map((t) => ({
        ...t,
        items: t.id === target.tierId ? insert(strip(t.items)) : strip(t.items),
      })),
    );
    setPool((p) => (target.tierId === "pool" ? insert(strip(p)) : strip(p)));
    setSelected(null);
  }

  const onDragStart = (e: DragEvent, ref: string) => {
    e.dataTransfer.setData("text/plain", ref);
    e.dataTransfer.effectAllowed = "move";
  };
  const dropHandlers = (tierId: string | "pool") => ({
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const ref = e.dataTransfer.getData("text/plain");
      if (!byRef.has(ref)) return;
      const before = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-ref]",
      )?.dataset.ref;
      moveItem(ref, { tierId, before });
    },
    // Tap mode: a card is selected, tap the row (or a card in it) to move it there.
    onClick: (e: React.MouseEvent) => {
      if (!selected) return;
      const before = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-ref]",
      )?.dataset.ref;
      if (before === selected) return setSelected(null);
      moveItem(selected, { tierId, before });
    },
  });

  const card = (ref: string) => {
    const item = byRef.get(ref);
    if (!item) return null;
    return (
      <button
        key={ref}
        type="button"
        data-ref={ref}
        draggable
        onDragStart={(e) => onDragStart(e, ref)}
        onClick={(e) => {
          // Let the row handle "move the selected card here"; otherwise select this one.
          if (selected && selected !== ref) return;
          e.stopPropagation();
          setSelected((s) => (s === ref ? null : ref));
        }}
        title={item.source ? `${item.name} (${item.source})` : item.name}
        className={`relative shrink-0 cursor-grab rounded active:cursor-grabbing ${
          selected === ref
            ? "outline outline-3 outline-offset-1 outline-white"
            : ""
        }`}
      >
        <TierThumbImage layers={item.layers} />
      </button>
    );
  };

  // --- Rows -----------------------------------------------------------------

  const updateTier = (id: string, patch: Partial<Tier>) =>
    setTiers((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const moveTier = (id: string, dir: -1 | 1) =>
    setTiers((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const j = i + dir;
      if (j < 0 || j >= ts.length) return ts;
      const next = [...ts];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addTier = (at: number) =>
    setTiers((ts) => {
      if (ts.length >= LIMITS.tiers) return ts;
      const next = [...ts];
      next.splice(at, 0, {
        id: newTierId(),
        label: "New",
        color: TIER_COLORS[(ts.length + 5) % TIER_COLORS.length],
        items: [],
      });
      return next;
    });

  const clearTier = (id: string) => {
    const t = tiers.find((x) => x.id === id);
    if (!t) return;
    setPool((p) => [...t.items, ...p]);
    updateTier(id, { items: [] });
  };

  const deleteTier = (id: string) => {
    if (tiers.length <= 1) return;
    clearTier(id);
    setTiers((ts) => ts.filter((t) => t.id !== id));
    setSettingsFor(null);
  };

  // --- Presets and adding cards --------------------------------------------

  function loadPreset(groups: string[]) {
    setTiers(defaultTiers());
    setPool(catalog.filter((c) => groups.includes(c.group)).map((c) => c.ref));
    setStarted(true);
    setMessage(null);
  }

  const inList = useMemo(
    () => new Set([...tiers.flatMap((t) => t.items), ...pool]),
    [tiers, pool],
  );

  // --- Saving ----------------------------------------------------------------

  function save(publish?: boolean) {
    setMessage(null);
    start(async () => {
      const res = await saveTierList(
        { title, description, data: { tiers, pool } },
        { id: initial?.id, publish },
      );
      if (res.needsLogin) {
        // The draft is already kept in this browser; come back here after signing in.
        router.push(
          `/login?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (!res.ok || !res.id) return setMessage(res.error ?? "Couldn't save.");
      setStatus(
        publish === undefined
          ? (status ?? "private")
          : publish
            ? "published"
            : "private",
      );
      setMessage(
        publish
          ? "Published"
          : publish === false
            ? "Saved to your account (private)"
            : "Saved",
      );
      if (!initial) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // ignore
        }
        router.replace(editPath(res.id));
      } else router.refresh();
    });
  }

  function remove() {
    if (!initial || !confirm("Delete this tier list? This can't be undone."))
      return;
    start(async () => {
      const res = await deleteTierList(initial.id);
      if (res.ok) router.push(listPath);
      else setMessage(res.error ?? "Couldn't delete.");
    });
  }

  // --- Render ----------------------------------------------------------------

  if (!started) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">What do you want to rank?</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PRESETS.map((p) => {
            const sample = catalog
              .filter((c) => p.groups.includes(c.group))
              .slice(0, 3);
            const n = catalog.filter((c) => p.groups.includes(c.group)).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPreset(p.groups)}
                className="flex flex-col items-start gap-2 rounded-xl border bg-fd-card p-3 text-left hover:bg-fd-accent"
              >
                <span className="flex h-12 gap-1">
                  {sample.map((s) => (
                    <TierThumbImage key={s.ref} layers={s.layers} small />
                  ))}
                </span>
                <span className="font-medium">{p.label}</span>
                {n > 0 && (
                  <span className="text-xs text-fd-muted-foreground">
                    {n} cards
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const editing = settingsFor ? tiers.find((t) => t.id === settingsFor) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.title))}
          placeholder="Tier list title"
          className="rounded-md border bg-fd-background px-3 py-2 text-xl font-bold outline-none focus:ring-2 focus:ring-fd-primary"
        />
        <input
          value={description}
          onChange={(e) =>
            setDescription(e.target.value.slice(0, LIMITS.description))
          }
          placeholder="Description (optional)"
          className="rounded-md border bg-fd-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fd-primary"
        />
      </div>

      {/* The board */}
      <div className="overflow-hidden rounded-md border border-black bg-[#1a1a17] text-black">
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            className="flex min-h-[96px] border-b border-black last:border-b-0"
          >
            <div
              className="flex w-24 shrink-0 items-center justify-center break-words p-2 text-center text-lg font-semibold sm:w-28"
              style={{ background: tier.color }}
            >
              {tier.label}
            </div>
            <div
              {...dropHandlers(tier.id)}
              className={`flex min-w-0 flex-1 flex-wrap content-start gap-0.5 p-0.5 ${selected ? "cursor-pointer" : ""}`}
            >
              {tier.items.map(card)}
            </div>
            <div className="flex w-10 shrink-0 flex-col items-center justify-center gap-1 bg-black text-white">
              <button
                type="button"
                aria-label={`Settings for ${tier.label}`}
                onClick={() => setSettingsFor(tier.id)}
                className="rounded p-1 hover:bg-white/20"
              >
                ⚙
              </button>
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => moveTier(tier.id, -1)}
                className="rounded px-1 text-xs hover:bg-white/20 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === tiers.length - 1}
                onClick={() => moveTier(tier.id, 1)}
                className="rounded px-1 text-xs hover:bg-white/20 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Unranked pool */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Unranked ({pool.length})</span>
          <span className="text-fd-muted-foreground">
            Drag cards into a tier, or tap a card and then tap a tier.
          </span>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              className="rounded-md border px-2 py-1 hover:bg-fd-accent"
            >
              {adding ? "Done adding" : "Add cards"}
            </button>
            <select
              value=""
              onChange={(e) => {
                const preset = PRESETS.find((p) => p.id === e.target.value);
                if (
                  preset &&
                  (count === 0 ||
                    confirm(
                      "Start over with this preset? Your current list is replaced.",
                    ))
                ) {
                  loadPreset(preset.groups);
                }
              }}
              className="rounded-md border bg-fd-background px-2 py-1"
            >
              <option value="">Start over with a preset…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div
          {...dropHandlers("pool")}
          className={`flex min-h-[100px] flex-wrap content-start gap-0.5 rounded-md border border-dashed bg-[#1a1a17] p-1 ${
            selected ? "cursor-pointer" : ""
          }`}
        >
          {pool.map(card)}
          {pool.length === 0 && (
            <span className="m-auto text-sm text-white/60">
              Every card is ranked.
            </span>
          )}
        </div>
        {adding && (
          <AddCards
            catalog={catalog}
            inList={inList}
            onAdd={(ref) => setPool((p) => [...p, ref])}
          />
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-fd-background/95 py-3 backdrop-blur">
        {status === "published" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => save()}
              className="rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent"
            >
              Unpublish
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent"
            >
              Save to my account
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(true)}
              className="rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground disabled:opacity-50"
            >
              Publish
            </button>
          </>
        )}
        {initial && (
          <>
            <a
              href={`/tierlists/${initial.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent"
            >
              View ↗
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10"
            >
              Delete
            </button>
          </>
        )}
        <span className="text-sm text-fd-muted-foreground" aria-live="polite">
          {pending ? "Saving…" : message}
          {!signedIn &&
            !message &&
            "You'll be asked to sign in when you save. Your list is kept meanwhile."}
          {status === "private" &&
            !pending &&
            !message &&
            "Private: only you can see it."}
        </span>
      </div>

      {editing && (
        <TierSettings
          tier={editing}
          canDelete={tiers.length > 1}
          canAdd={tiers.length < LIMITS.tiers}
          onChange={(patch) => updateTier(editing.id, patch)}
          onClear={() => clearTier(editing.id)}
          onDelete={() => deleteTier(editing.id)}
          onAddAbove={() => addTier(tiers.indexOf(editing))}
          onAddBelow={() => addTier(tiers.indexOf(editing) + 1)}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </div>
  );
}

function TierSettings({
  tier,
  canDelete,
  canAdd,
  onChange,
  onClear,
  onDelete,
  onAddAbove,
  onAddBelow,
  onClose,
}: {
  tier: Tier;
  canDelete: boolean;
  canAdd: boolean;
  onChange: (patch: Partial<Tier>) => void;
  onClear: () => void;
  onDelete: () => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onClose: () => void;
}) {
  const button =
    "rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent disabled:opacity-40";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Clicking outside the dialog closes it. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-label="Tier settings"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border bg-fd-background p-5 shadow-xl"
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            Choose a label background colour:
          </span>
          <div className="flex flex-wrap gap-2">
            {TIER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onChange({ color: c })}
                className={`size-8 rounded-full border-2 ${tier.color === c ? "border-fd-foreground" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <label
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border text-xs"
              title="Custom colour"
            >
              +
              <input
                type="color"
                value={tier.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="sr-only"
              />
            </label>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Edit label text:
          <textarea
            value={tier.label}
            rows={2}
            onChange={(e) =>
              onChange({ label: e.target.value.slice(0, LIMITS.label) })
            }
            className="rounded-md border bg-fd-background px-2 py-1.5 font-normal outline-none focus:ring-2 focus:ring-fd-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canDelete}
            onClick={onDelete}
            className={button}
          >
            Delete row
          </button>
          <button type="button" onClick={onClear} className={button}>
            Clear row images
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={onAddAbove}
            className={button}
          >
            Add a row above
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={onAddBelow}
            className={button}
          >
            Add a row below
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="self-end rounded-md bg-fd-primary px-4 py-1.5 text-sm text-fd-primary-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function AddCards({
  catalog,
  inList,
  onAdd,
}: {
  catalog: TierItem[];
  inList: Set<string>;
  onAdd: (ref: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const groups = useMemo(
    () => [...new Set(catalog.map((c) => c.group))],
    [catalog],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter(
        (c) =>
          !inList.has(c.ref) &&
          (group === "all" || c.group === group) &&
          (!q || c.name.toLowerCase().includes(q)),
      )
      .slice(0, 150);
  }, [catalog, inList, query, group]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-fd-card p-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every card…"
          className="flex-1 rounded-md border bg-fd-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fd-primary"
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="rounded-md border bg-fd-background px-2 py-1 text-sm"
        >
          <option value="all">All kinds</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g.startsWith("mp-") ? `MP ${g.slice(3)}` : g}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Click a card to add it to the unranked pool.
      </p>
      <div className="flex flex-wrap gap-1">
        {results.map((c) => (
          <button
            key={c.ref}
            type="button"
            onClick={() => onAdd(c.ref)}
            title={c.source ? `${c.name} (${c.source})` : c.name}
            className="rounded hover:bg-fd-accent"
          >
            <TierThumbImage layers={c.layers} small />
          </button>
        ))}
        {results.length === 0 && (
          <span className="text-sm text-fd-muted-foreground">
            Nothing to add.
          </span>
        )}
      </div>
    </div>
  );
}
