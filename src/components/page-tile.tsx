import Link from "next/link";
import { ICON_PADDING, IconFan } from "@/components/icon-fan";
import type { Frontmatter } from "@/lib/mdx/compile";
import { resolveIcon } from "@/lib/mdx/compile";

/**
 * A guide or tool as it's listed on the Guides and Tools pages: title, description, tags and its
 * icon cards. Without `href` it's a plain box (the editor's preview of it).
 */
export function PageTile({
  frontmatter,
  href,
  parts = 0,
}: {
  frontmatter: Frontmatter;
  href?: string;
  /** How many parts the guide has, shown as a badge. */
  parts?: number;
}) {
  const icons = frontmatter.icon
    .map(resolveIcon)
    .filter((item) => item !== undefined);
  const content = (
    <>
      {/* The page's cards, large and faded in the corner behind the text. */}
      <IconFan cards={icons} />
      <span className="relative block font-semibold">{frontmatter.title}</span>
      {frontmatter.description && (
        <span
          className={`relative mt-1 block text-sm text-fd-muted-foreground ${ICON_PADDING[icons.length]}`}
        >
          {frontmatter.description}
        </span>
      )}
      {(frontmatter.tags.length > 0 || parts > 0) && (
        <span className="relative mt-3 flex flex-wrap gap-1">
          {parts > 0 && (
            <span className="rounded-full bg-fd-primary px-2 py-0.5 text-xs font-medium text-fd-primary-foreground">
              {parts} parts
            </span>
          )}
          {frontmatter.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border px-2 py-0.5 text-xs text-fd-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </>
  );
  const className =
    "group relative block h-full overflow-hidden rounded-xl border bg-fd-card p-4 transition-colors hover:bg-fd-accent";
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
