import { describe, expect, test } from "vitest";
import { rehypeExternalLinks } from "../src/plugins/rehype-external-links.mjs";

type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastText = { type: "text"; value: string };
type HastNode = HastElement | HastText;

function elem(
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = [],
): HastElement {
  return { type: "element", tagName, properties, children };
}
function text(value: string): HastText {
  return { type: "text", value };
}

/** Runs the plugin over `<p><a href=…>…</a></p>` and returns the link. */
function link(
  href: string,
  children: HastNode[] = [text("a page")],
  properties: Record<string, unknown> = {},
) {
  const a = elem("a", { href, ...properties }, children);
  rehypeExternalLinks({ site: "https://tanvibhakta.in" })({
    type: "root",
    children: [elem("p", {}, [a])],
  });
  return a;
}

/** Compact markup-ish rendering, enough to assert on structure. */
function show(node: HastNode): string {
  if (node.type === "text") return node.value;
  if (node.tagName === "svg") return "[icon]";
  const cls = (node.properties.className as string[] | undefined)?.[0];
  const open = cls ? `${node.tagName}.${cls}` : node.tagName;
  return `<${open}>${node.children.map(show).join("")}</${node.tagName}>`;
}
const inner = (a: HastElement) => a.children.map(show).join("");
const SR = "<span.sr-only> (opens in a new tab)</span>";

describe("rehypeExternalLinks", () => {
  test.each([
    "https://example.com/",
    "http://example.com/page",
    "//example.com/protocol-relative",
    "https://tanvibhakta.in.example.com/",
  ])("%s opens in a new tab, with icon and screen-reader text", (href) => {
    const a = link(href);
    expect(a.properties.target).toBe("_blank");
    expect(a.properties.rel).toEqual(["noopener"]);
    expect(inner(a)).toBe(`a <span.external-link-tail>page[icon]</span>${SR}`);
  });

  test.each([
    "/blog/post/",
    "post/",
    "#p-3",
    "mailto:hi@example.com",
    "tel:+100",
    "https://tanvibhakta.in/blog/post/",
    "http://tanvibhakta.in/blog/post/",
    "https://www.tanvibhakta.in/",
    "https://TanviBhakta.in",
  ])("%s stays untouched", (href) => {
    const a = link(href);
    expect(a.properties).toEqual({ href });
    expect(inner(a)).toBe("a page");
  });

  test("a single-word link is wholly inside the tail", () => {
    expect(inner(link("https://x.com", [text("docs")]))).toBe(
      `<span.external-link-tail>docs[icon]</span>${SR}`,
    );
  });

  test("ignores trailing whitespace when finding the last word", () => {
    expect(inner(link("https://x.com", [text("the docs "), text(" ")]))).toBe(
      `the <span.external-link-tail>docs[icon]</span>${SR}`,
    );
  });

  test("descends into trailing inline formatting", () => {
    const a = link("https://x.com", [
      text("see "),
      elem("em", {}, [text("the docs")]),
    ]);
    expect(inner(a)).toBe(
      `see <em>the <span.external-link-tail>docs[icon]</span></em>${SR}`,
    );
  });

  test("an image after text stays glued to the icon", () => {
    const a = link("https://x.com", [text("logo "), elem("img")]);
    expect(inner(a)).toBe(
      `logo <span.external-link-tail><img></img>[icon]</span>${SR}`,
    );
  });

  test("image-only links get screen-reader text but no icon", () => {
    const a = link("https://x.com", [elem("img", { alt: "A" })]);
    expect(a.properties.target).toBe("_blank");
    expect(inner(a)).toBe(`<img></img>${SR}`);
  });

  test("keeps existing rel values", () => {
    const a = link("https://x.com", [text("me")], { rel: ["me"] });
    expect(a.properties.rel).toEqual(["me", "noopener"]);
  });

  test("each link gets its own icon node", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("p", {}, [
          elem("a", { href: "https://a.com" }, [text("a")]),
          elem("a", { href: "https://b.com" }, [text("b")]),
        ]),
      ],
    };
    rehypeExternalLinks({ site: "https://tanvibhakta.in" })(tree);
    const icons = (tree.children[0] as HastElement).children.map(
      (a) => ((a as HastElement).children[0] as HastElement).children[1],
    );
    expect(icons[0]).not.toBe(icons[1]);
  });
});
