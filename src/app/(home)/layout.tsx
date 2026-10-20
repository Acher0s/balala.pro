import { SiteLayout } from "@/components/site-layout";

export const dynamic = "force-dynamic";

export default function Layout({ children }: LayoutProps<"/">) {
  return <SiteLayout plain>{children}</SiteLayout>;
}
