import { ThemeEditor } from "@/components/studio/theme-editor";
import { requireUser } from "@/lib/auth";
import { getTheme } from "@/lib/settings";

export default async function StylePage() {
  await requireUser("admin");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Style</h1>
        <p className="text-sm text-fd-muted-foreground">
          Colours, corners and heading font for the whole site. Changes show in
          the preview right away; nothing changes for visitors until you save.
        </p>
      </div>
      <ThemeEditor saved={await getTheme()} />
    </main>
  );
}
