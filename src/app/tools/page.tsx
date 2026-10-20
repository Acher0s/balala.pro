import type { Metadata } from "next";
import { PageOverview } from "@/components/page-overview";

export const metadata: Metadata = { title: "Tools" };

export default function ToolsIndex() {
  return <PageOverview kind="tool" />;
}
