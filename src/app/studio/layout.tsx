import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StudioNav } from "@/components/studio/studio-nav";
import { getCurrentUser, hasRole, STUDIO } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-fd-background">
      {user && (
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm">
          <Link href={STUDIO} className="font-semibold">
            Studio
          </Link>
          {hasRole(user, "writer") && (
            <StudioNav isAdmin={user.role === "admin"} />
          )}
          <Link href="/" className="text-fd-muted-foreground">
            View site ↗
          </Link>
          <span className="ml-auto flex items-center gap-2">
            {user.avatarUrl && (
              // biome-ignore lint/performance/noImgElement: Discord avatar
              <img
                src={user.avatarUrl}
                alt=""
                className="size-6 rounded-full"
              />
            )}
            <span>
              {user.displayName}{" "}
              <span className="text-fd-muted-foreground">
                ({user.role === "none" ? "visitor" : user.role})
              </span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border px-2 py-1 hover:bg-fd-accent"
              >
                Sign out
              </button>
            </form>
          </span>
        </header>
      )}
      {children}
    </div>
  );
}
