import { SiteSettingsForm } from "@/components/studio/forms";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export default async function SiteSettingsPage() {
  await requireUser("admin");
  const settings = await getSettings();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Site settings</h1>
      <SiteSettingsForm
        siteName={settings.siteName}
        homeIntro={settings.homeIntro}
      />
    </main>
  );
}
