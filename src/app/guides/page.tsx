import type { Metadata } from "next";
import { PageOverview } from "@/components/page-overview";

export const metadata: Metadata = { title: "Guides" };

export default function GuidesIndex() {
  return <PageOverview kind="guide" />;
}
