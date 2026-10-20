import {
  PublishedPage,
  publishedPageMetadata,
} from "@/components/published-page";

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  return <PublishedPage kind="tool" slug={(await params).slug} />;
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">) {
  return publishedPageMetadata("tool", (await params).slug);
}
