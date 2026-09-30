import MarkdownIt from "markdown-it";

/**
 * Titles are authored as a small subset of inline markdown: emphasis, strong,
 * ~~strikethrough~~ and `code`. Links and raw HTML stay literal — titles are
 * usually rendered inside an <a> already, and nested anchors are invalid.
 */
const titleParser = new MarkdownIt("zero").enable([
  "emphasis",
  "strikethrough",
  "backticks",
]);

/** A title as HTML, for headings and link text. Use with `set:html`. */
export function titleHtml(title: string): string {
  return titleParser.renderInline(title);
}

/**
 * A title as plain text, for contexts that can't carry markup: the tab
 * title, og:title, feeds. Markers are dropped but their words are kept, so
 * "Birthday ~~Blues~~ Purples" reads "Birthday Blues Purples".
 */
export function titleText(title: string): string {
  const [inline] = titleParser.parseInline(title, {});
  return (inline?.children ?? [])
    .filter((t) => t.type === "text" || t.type === "code_inline")
    .map((t) => t.content)
    .join("");
}
