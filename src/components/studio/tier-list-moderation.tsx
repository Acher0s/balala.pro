"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTierList, setTierListStatus } from "@/app/tierlists/actions";

/** Admin buttons for one tier list. */
export function TierListModeration({
  id,
  published,
}: {
  id: string;
  published: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <span className="flex gap-2 text-sm">
      {published && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setTierListStatus(id, false))}
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
        >
          Unpublish
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          confirm("Delete this tier list for good?") &&
          run(() => deleteTierList(id))
        }
        className="rounded-md px-2 py-1 text-red-600 hover:bg-red-500/10"
      >
        Delete
      </button>
    </span>
  );
}
