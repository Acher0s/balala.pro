import {
  PublishedPage,
  publishedPageMetadata,
} from "@/components/published-page";

export default async function GuidePage({
  params,
}: PageProps<"/guides/[slug]">) {
  return <PublishedPage kind="guide" slug={(await params).slug} />;
}

export async function generateMetadata({
  params,
}: PageProps<"/guides/[slug]">) {
  return publishedPageMetadata("guide", (await params).slug);
}
