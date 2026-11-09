import Link from "next/link";
import { CreatorsEditor } from "@/components/studio/creators-editor";
import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import { twitchConfigured } from "@/lib/twitch";

export default async function CreatorsAdminPage() {
  await requireUser("admin");
  const creators = await listCreators();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Creators</h1>
        <p className="text-sm text-fd-muted-foreground">
          The people on the{" "}
          <Link href="/creators" className="underline">
            Creators page
          </Link>
          , in this order. While one of them is live on Twitch in the Balatro
          category, their stream shows at the top of the page.
        </p>
        {!twitchConfigured() && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm">
            Twitch isn't set up, so no streams show yet. Make an app at
            dev.twitch.tv and set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in
            the server's .env.
          </p>
        )}
      </div>
      <CreatorsEditor creators={creators} />
    </main>
  );
}
