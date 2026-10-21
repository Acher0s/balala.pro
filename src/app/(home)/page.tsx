import { BookOpen, Calculator, Rows3 } from "lucide-react";
import Link from "next/link";
import { Announcement } from "@/components/announcement";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** The site's three sections; each has its own overview page. */
const SECTIONS = [
  {
    href: "/guides",
    title: "Guides",
    text: "Strategy, from the basics to advanced maths",
    Icon: BookOpen,
  },
  {
    href: "/tierlists",
    title: "Tier lists",
    text: "Browse rankings or make your own",
    Icon: Rows3,
  },
  {
    href: "/tools",
    title: "Tools",
    text: "Calculators for scores, odds and money",
    Icon: Calculator,
  },
];

export default async function HomePage() {
  const settings = await getSettings();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16">
      <div>
        <h1 className="mb-3 text-3xl font-bold">{settings.siteName}</h1>
        <p className="whitespace-pre-line text-fd-muted-foreground">
          {settings.homeIntro}
        </p>
      </div>
      <nav className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map(({ href, title, text, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-3 rounded-xl border bg-fd-card p-5 transition-colors hover:border-fd-primary/50 hover:bg-fd-accent"
          >
            <Icon className="size-6 text-fd-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-fd-muted-foreground">
                {text}
              </span>
            </span>
          </Link>
        ))}
      </nav>
      <Announcement text={settings.announcement} />
    </main>
  );
}
