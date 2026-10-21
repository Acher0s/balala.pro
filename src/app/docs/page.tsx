import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { GuideView } from "@/components/guide-view";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Guide markup reference",
  robots: { index: false },
};

/** Authors' reference for everything the guide markup can do, rendered through the real pipeline. */
export default async function DocsPage() {
  await requireUser("writer", "/docs");
  const source = await readFile(
    join(process.cwd(), "content", "docs", "markup-reference.mdx"),
    "utf8",
  );
  const version = createHash("sha1").update(source).digest("hex").slice(0, 12);
  return <GuideView cacheKey={`docs:${version}`} source={source} />;
}
