import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter, Pixelify_Sans } from "next/font/google";
import { getTheme } from "@/lib/settings";
import { themeCss } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
});

/** Heading font for themes that pick "pixel"; only downloaded when a theme uses it. */
const pixel = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  preload: false,
});

// The theme can change at any time from Studio → Style.
export const dynamic = "force-dynamic";

export default async function Layout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();
  return (
    <html
      lang="en"
      className={`${inter.className} ${pixel.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Built from validated hex colours, a number and a fixed font choice: plain CSS text. */}
        <style id="site-theme">{themeCss(theme)}</style>
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
