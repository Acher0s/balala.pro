import { z } from "zod";

/**
 * The site's look, set by admins in Studio → Style. Six colours per mode; every other colour the
 * layout uses is derived from them (see themeVars), so a theme always stays consistent.
 */
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const themeColorsSchema = z.object({
  background: hex,
  card: hex,
  text: hex,
  muted: hex,
  border: hex,
  accent: hex,
});

export const siteThemeSchema = z.object({
  /** The preset this theme started from; only used to highlight it on the Style page. */
  preset: z.string().max(40),
  light: themeColorsSchema,
  dark: themeColorsSchema,
  /** Corner roundness as a multiple of the default: 0 is square, 2 is twice as round. */
  roundness: z.number().min(0).max(2),
  headingFont: z.enum(["default", "pixel"]),
});

export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type SiteTheme = z.infer<typeof siteThemeSchema>;
export type ThemeMode = "light" | "dark";

export const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  background: "Background",
  card: "Cards and boxes",
  text: "Text",
  muted: "Muted text",
  border: "Borders",
  accent: "Accent",
};

export const PRESETS: { id: string; name: string; theme: SiteTheme }[] = [
  {
    id: "neutral",
    name: "Neutral",
    theme: {
      preset: "neutral",
      light: {
        background: "#f5f5f5",
        card: "#f2f2f2",
        text: "#0a0a0a",
        muted: "#737373",
        border: "#dedede",
        accent: "#171717",
      },
      dark: {
        background: "#121212",
        card: "#191919",
        text: "#ebebeb",
        muted: "#a8a8a8",
        border: "#2b2b2b",
        accent: "#fafafa",
      },
      roundness: 1,
      headingFont: "default",
    },
  },
  {
    id: "felt",
    name: "Felt",
    theme: {
      preset: "felt",
      light: {
        background: "#edf3ee",
        card: "#e2ebe4",
        text: "#13221a",
        muted: "#4f6357",
        border: "#c4d5c9",
        accent: "#d0453b",
      },
      dark: {
        background: "#11241b",
        card: "#173026",
        text: "#e8f1ea",
        muted: "#9db8a8",
        border: "#29493a",
        accent: "#fe5f55",
      },
      roundness: 1,
      headingFont: "default",
    },
  },
  {
    id: "arcade",
    name: "Arcade",
    theme: {
      preset: "arcade",
      light: {
        background: "#f3f1fa",
        card: "#eae7f6",
        text: "#1b1630",
        muted: "#5f5878",
        border: "#d3cdea",
        accent: "#0083d4",
      },
      dark: {
        background: "#19162a",
        card: "#221e36",
        text: "#f1eefc",
        muted: "#a59fc2",
        border: "#3a3455",
        accent: "#009dff",
      },
      roundness: 1.5,
      headingFont: "pixel",
    },
  },
  {
    id: "parchment",
    name: "Parchment",
    theme: {
      preset: "parchment",
      light: {
        background: "#f6efe1",
        card: "#efe4cf",
        text: "#2b2117",
        muted: "#6f5f4b",
        border: "#dccdb0",
        accent: "#b8402f",
      },
      dark: {
        background: "#1f1a14",
        card: "#2a231b",
        text: "#f2e8d8",
        muted: "#b6a58b",
        border: "#43382a",
        accent: "#eac058",
      },
      roundness: 0.5,
      headingFont: "default",
    },
  },
];

export const DEFAULT_THEME: SiteTheme = PRESETS[0].theme;

/** Black or white, whichever reads better on the given colour. */
function readableOn(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#0a0a0a" : "#fafafa";
}

const mix = (a: string, b: string, bPercent: number) =>
  `color-mix(in oklab, ${a}, ${b} ${bPercent}%)`;

/** All the layout's colour variables for one mode, derived from the theme's six colours. */
export function themeVars(c: ThemeColors): Record<string, string> {
  return {
    "--color-fd-background": c.background,
    "--color-fd-foreground": c.text,
    "--color-fd-card": c.card,
    "--color-fd-card-foreground": c.text,
    "--color-fd-popover": c.card,
    "--color-fd-popover-foreground": c.text,
    "--color-fd-muted": mix(c.card, c.text, 4),
    "--color-fd-muted-foreground": c.muted,
    "--color-fd-secondary": mix(c.card, c.text, 6),
    "--color-fd-secondary-foreground": c.text,
    "--color-fd-border": c.border,
    "--color-fd-primary": c.accent,
    "--color-fd-primary-foreground": readableOn(c.accent),
    "--color-fd-accent": mix(c.card, c.accent, 14),
    "--color-fd-accent-foreground": c.text,
    "--color-fd-ring": c.accent,
  };
}

/** Tailwind's corner sizes, scaled by the theme's roundness. */
export function radiusVars(roundness: number): Record<string, string> {
  const sizes = { sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, "2xl": 1 };
  return Object.fromEntries(
    Object.entries(sizes).map(([k, rem]) => [
      `--radius-${k}`,
      `${+(rem * roundness).toFixed(3)}rem`,
    ]),
  );
}

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

/** The stylesheet that applies a theme to the whole site. */
export function themeCss(theme: SiteTheme) {
  return [
    block("html:root", {
      ...themeVars(theme.light),
      ...radiusVars(theme.roundness),
    }),
    // The phone menu drawer has its own colours in the base theme; keep it in line.
    block("html.dark, html.dark #nd-sidebar", themeVars(theme.dark)),
    theme.headingFont === "pixel"
      ? "h1,h2,h3,h4{font-family:var(--font-pixel),ui-monospace,monospace;letter-spacing:0.01em}"
      : "",
  ].join("\n");
}
