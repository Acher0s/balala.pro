import type { ComponentProps } from "react";

/**
 * Images in guides (Markdown ![alt](src), uploads, GIFs). A plain <img>: Markdown images have
 * no known size, and Next's image optimiser would also stop GIFs from animating.
 */
export function GuideImage({ alt = "", ...props }: ComponentProps<"img">) {
  return (
    // biome-ignore lint/performance/noImgElement: see above
    <img
      alt={alt}
      loading="lazy"
      decoding="async"
      {...props}
      className="mx-auto h-auto max-w-full rounded-lg"
    />
  );
}
