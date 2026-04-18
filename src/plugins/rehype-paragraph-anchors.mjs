import { visit } from "unist-util-visit";

export function rehypeParagraphAnchors() {
  return (tree) => {
    let count = 0;
    visit(tree, "element", (node) => {
      if (node.tagName === "p") {
        count++;
        const id = `p-${count}`;
        node.properties = { ...node.properties, id };

        node.children.push({
          type: "element",
          tagName: "a",
          properties: {
            href: `#${id}`,
            className: ["para-link"],
            ariaLabel: "Link to this paragraph",
          },
          children: [{ type: "text", value: " #" }],
        });
      }
    });
  };
}
