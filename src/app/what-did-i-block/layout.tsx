import { SiteLayout } from "@/components/site-layout";

export const dynamic = "force-dynamic";

export default function Layout({ children }: LayoutProps<"/what-did-i-block">) {
  return <SiteLayout plain>{children}</SiteLayout>;
}
