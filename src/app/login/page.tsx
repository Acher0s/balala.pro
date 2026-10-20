import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser, safeNext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  cancelled: "Login was cancelled.",
  state: "The login link expired. Please try again.",
  discord: "Discord didn't accept the login. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const q = `next=${encodeURIComponent(next)}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-fd-muted-foreground">
          Sign in to save tier lists to your account. Writers also use this to
          get to the studio.
        </p>
      </div>
      {message && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm">
          {message}
        </p>
      )}
      <a
        href={`/api/auth/discord?${q}`}
        className="flex items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 font-medium text-white hover:bg-[#4752c4]"
      >
        Sign in with Discord
      </a>
      {devLoginEnabled && (
        <div className="rounded-lg border border-dashed p-3 text-sm">
          <p className="mb-2 font-medium">Local development only</p>
          <div className="flex flex-wrap gap-2">
            {(["admin", "writer", "none"] as const).map((role) => (
              <a
                key={role}
                href={`/api/auth/dev-login?as=${role}&${q}`}
                className="rounded-md border px-2 py-1 hover:bg-fd-accent"
              >
                Sign in as test {role === "none" ? "member" : role}
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
