"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/studio/actions";

export interface MenuUser {
  displayName: string;
  avatarUrl: string | null;
  role: "none" | "writer" | "admin";
}

const item = "block rounded-md px-3 py-1.5 text-sm hover:bg-fd-accent";

/** "Sign in" button, or the signed-in user's menu, in the site navigation. */
export function AccountMenu({ user }: { user: MenuUser | null }) {
  const pathname = usePathname();

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-fd-accent"
      >
        Sign in
      </Link>
    );
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-fd-accent">
        {user.avatarUrl ? (
          // biome-ignore lint/performance/noImgElement: Discord avatar
          <img src={user.avatarUrl} alt="" className="size-6 rounded-full" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-fd-primary text-xs text-fd-primary-foreground">
            {user.displayName[0]}
          </span>
        )}
        <span className="max-w-32 truncate">{user.displayName}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-1 flex w-52 flex-col rounded-lg border bg-fd-popover p-1 shadow-lg">
        <Link href="/tierlists/mine" className={item}>
          My tier lists
        </Link>
        <Link href="/tierlists/new" className={item}>
          Make a tier list
        </Link>
        {user.role === "none" ? (
          <Link href="/studio" className={item}>
            Become a writer
          </Link>
        ) : (
          <Link href="/studio" className={item}>
            Writer studio
          </Link>
        )}
        <form action={signOut} className="border-t pt-1">
          <input type="hidden" name="next" value={pathname} />
          <button type="submit" className={`${item} w-full text-left`}>
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
