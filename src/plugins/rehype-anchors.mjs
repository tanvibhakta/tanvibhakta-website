import { visit } from "unist-util-visit";

export function rehypeAnchors() {
  return (tree) => {
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
