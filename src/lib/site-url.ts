/** Public origin of the site, e.g. https://bmp.example.com. Set SITE_URL in production. */
export function siteUrl(req?: Request) {
  const fromEnv = process.env.SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}
