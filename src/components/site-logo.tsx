/**
 * The site's logo: a small red card with a pixel B, then the site name. A trailing ".pro" (or
 * any ".tld") is drawn in the card's red.
 */
export function SiteLogo({ siteName }: { siteName: string }) {
  const dot = siteName.lastIndexOf(".");
  const name = dot > 0 ? siteName.slice(0, dot) : siteName;
  const tld = dot > 0 ? siteName.slice(dot) : "";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <LogoMark className="h-6 w-auto shrink-0" />
      <span className="font-semibold">
        {name.toLowerCase()}
        {tld && <span className="text-[#e0463c]">{tld.toLowerCase()}</span>}
      </span>
    </span>
  );
}

/** The card mark on its own (34×46): for favicons and small places. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 34 46"
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect width="34" height="46" rx="4" fill="#e0463c" />
      <g fill="#fffaf0" transform="translate(7 9) scale(4)">
        <rect x="0" y="0" width="1" height="7" />
        <rect x="1" y="0" width="3" height="1" />
        <rect x="1" y="3" width="3" height="1" />
        <rect x="1" y="6" width="3" height="1" />
        <rect x="4" y="1" width="1" height="2" />
        <rect x="4" y="4" width="1" height="2" />
      </g>
    </svg>
  );
}
