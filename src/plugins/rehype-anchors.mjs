import { visit } from "unist-util-visit";

/**
 * Adds `#`-style permalink anchors to every paragraph and list item.
 *
 * Disabling:
 *   - Per-entry: set `anchors: false` in the markdown file's frontmatter.
 *   - Collection-wide / path-based: pass a `skip` predicate when registering
 *     the plugin in `astro.config.mjs`, e.g.
 *
 *       [rehypeAnchors, { skip: (file) => file.path?.includes("/poetry/") }]
 *
 * Frontmatter `anchors: false` always wins; `skip` is a default applied per
 * file path. The plugin runs once per file at content-sync time.
 *
 * @typedef {Object} RehypeAnchorsFile
 * @property {string} [path]
 * @property {{ astro?: { frontmatter?: Record<string, unknown> } }} [data]
 *
 * @param {{ skip?: (file: RehypeAnchorsFile | undefined) => boolean | undefined }} [options]
 */
export function rehypeAnchors(options = {}) {
  const { skip } = options;

  return (tree, file) => {
    const fm = file?.data?.astro?.frontmatter;
    if (fm?.anchors === false) return;
    if (fm?.anchors !== true && typeof skip === "function" && skip(file)) {
      return;
    }

    let pCount = 0;
    let liCount = 0;

    visit(tree, "element", (node) => {
      const isPara = node.tagName === "p";
      const isItem = node.tagName === "li";
      if (!isPara && !isItem) return;

      // Loose lists render as <li><p>...</p></li> — let the inner <p>
      // own the anchor so we don't double-anchor the same content.
      if (isItem && node.children.some((c) => c.tagName === "p")) return;

      const id = isPara ? `p-${++pCount}` : `li-${++liCount}`;
      node.properties = { ...node.properties, id };

      node.children.push({
        type: "element",
        tagName: "a",
        properties: {
          href: `#${id}`,
          className: ["anchor-link"],
          ariaLabel: isPara
            ? "Link to this paragraph"
            : "Link to this item",
        },
        children: [{ type: "text", value: " #" }],
      });
    });
  };
}
