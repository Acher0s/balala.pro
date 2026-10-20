export function GuideMeta({
  author,
  patch,
  tags,
}: {
  author?: string;
  patch?: string;
  tags: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-fd-muted-foreground">
      {author && (
        <span>
          By <span className="font-medium text-fd-foreground">{author}</span>
        </span>
      )}
      {author && patch && <span aria-hidden>·</span>}
      {patch && <span>BMP {patch}</span>}
      {tags.map((tag) => (
        <span key={tag} className="rounded-full border px-2 py-0.5 text-xs">
          {tag}
        </span>
      ))}
    </div>
  );
}
