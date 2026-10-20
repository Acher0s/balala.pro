import { SiteLayout } from "@/components/site-layout";

export const dynamic = "force-dynamic";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <SiteLayout
      tree={{
        name: "Documentation",
        children: [
          { type: "page", name: "Guide markup reference", url: "/docs" },
          { type: "page", name: "Writer studio", url: "/studio" },
        ],
      }}
    >
      {children}
    </SiteLayout>
  );
}
