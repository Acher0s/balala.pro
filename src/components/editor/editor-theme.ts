import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Editor colours taken from the site's theme variables, so the editor follows light and dark
 * mode by itself. (CodeMirror's default theme is light-only: white gutter, dark-on-light syntax.)
 */
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    color: "var(--color-fd-foreground)",
    backgroundColor: "var(--color-fd-background)",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  ".cm-content": { caretColor: "var(--color-fd-foreground)" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-fd-foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-fd-card)",
    color: "var(--color-fd-muted-foreground)",
    borderRight: "1px solid var(--color-fd-border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--color-fd-accent)",
    color: "var(--color-fd-foreground)",
  },
  ".cm-activeLine": {
    backgroundColor:
      "color-mix(in oklab, var(--color-fd-accent) 45%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in oklab, var(--color-fd-primary) 25%, transparent)",
    },
  ".cm-selectionMatch": {
    backgroundColor:
      "color-mix(in oklab, var(--color-fd-primary) 15%, transparent)",
  },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor:
      "color-mix(in oklab, var(--color-fd-primary) 25%, transparent)",
    outline: "none",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-fd-accent)",
    color: "var(--color-fd-muted-foreground)",
    border: "none",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--color-fd-popover)",
    color: "var(--color-fd-popover-foreground)",
    border: "1px solid var(--color-fd-border)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--color-fd-accent)",
    color: "var(--color-fd-accent-foreground)",
  },
  ".cm-panels": {
    backgroundColor: "var(--color-fd-card)",
    color: "var(--color-fd-foreground)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--color-fd-border)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklab, #ff9a00 30%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, #ff9a00 55%, transparent)",
  },
  ".cm-textfield, .cm-button": {
    backgroundColor: "var(--color-fd-background)",
    color: "var(--color-fd-foreground)",
    border: "1px solid var(--color-fd-border)",
    backgroundImage: "none",
  },
});

/** Markdown and component syntax colours that read well on both light and dark backgrounds. */
const highlight = HighlightStyle.define([
  {
    tag: tags.heading,
    fontWeight: "bold",
    color: "var(--color-fd-foreground)",
  },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "#3b9eff", textDecoration: "underline" },
  {
    tag: [tags.processingInstruction, tags.meta, tags.contentSeparator],
    color: "var(--color-fd-muted-foreground)",
  },
  { tag: [tags.monospace, tags.string], color: "#2fae7f" },
  { tag: [tags.tagName, tags.typeName], color: "#e5534b" },
  { tag: [tags.attributeName, tags.propertyName], color: "#d4a72c" },
  { tag: [tags.number, tags.bool, tags.atom], color: "#a371f7" },
  {
    tag: [tags.quote, tags.comment],
    color: "var(--color-fd-muted-foreground)",
    fontStyle: "italic",
  },
  {
    tag: [tags.list, tags.punctuation, tags.angleBracket, tags.bracket],
    color: "var(--color-fd-muted-foreground)",
  },
]);

export const editorAppearance = [editorTheme, syntaxHighlighting(highlight)];
