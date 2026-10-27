import { describe, expect, test } from "vitest";
import rehypeWayback, { hasVisibleText } from "../index.js";

type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastText = { type: "text"; value: string };
type HastNode = HastElement | HastText;

const elem = (
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = [],
): HastElement => ({ type: "element", tagName, properties, children });
const text = (value: string): HastText => ({ type: "text", value });

/** Compact markup-ish rendering, enough to assert on structure. */
function show(node: HastNode): string {
  if (node.type === "text") return node.value;
  const cls = (node.properties.className as string[] | undefined)?.[0];
  const open = cls ? `${node.tagName}.${cls}` : node.tagName;
  return `<${open}>${node.children.map(show).join("")}</${node.tagName}>`;
}

const SNAPSHOT = "https://web.archive.org/web/20240101000000/https://a.com/";

/** Runs the plugin over `<p>see <a href=…>…</a>.</p>`, returns the <p>. */
function run(
  href: string,
  children: HastNode[] = [text("a page")],
  options: Partial<Parameters<typeof rehypeWayback>[0]> = {},
) {
  const p = elem("p", {}, [
    text("see "),
    elem("a", { href }, children),
    text("."),
  ]);
  rehypeWayback({ archives: { "https://a.com/": SNAPSHOT }, ...options })({
    type: "root",
    children: [p],
  });
  return p;
}

describe("rehypeWayback", () => {
  test("adds a bracketed archive link after a link with a snapshot", () => {
    const p = run("https://a.com/");
    expect(p.children.map(show).join("")).toBe(
      "see <a>a page</a> <span.archive-link>[<a>archive</a>]</span>.",
    );
    const archive = (p.children[3] as HastElement).children[1] as HastElement;
    expect(archive.properties).toEqual({ href: SNAPSHOT });
  });

  test("label, class, properties and screen-reader text are configurable", () => {
    const p = run("https://a.com/", undefined, {
      label: "archived",
      className: "wb",
      properties: { target: "_blank" },
      screenReaderText: " copy",
    });
    expect(show(p.children[3])).toBe(
      "<span.wb>[<a>archived<span.sr-only> copy</span></a>]</span>",
    );
    const archive = (p.children[3] as HastElement).children[1] as HastElement;
    expect(archive.properties).toEqual({ href: SNAPSHOT, target: "_blank" });
  });

  test("matches regardless of fragment and host case", () => {
    expect(run("https://A.com/#section").children).toHaveLength(5);
  });

  test("links without a snapshot, or relative, are left alone", () => {
    expect(run("https://b.com/").children).toHaveLength(3);
    expect(run("/a").children).toHaveLength(3);
  });

  test("image-only links are skipped, even with screen-reader text", () => {
    const children = [
      elem("img"),
      elem("span", { className: ["sr-only"] }, [text(" (new tab)")]),
    ];
    expect(run("https://a.com/", children).children).toHaveLength(3);
  });

  test("a custom test decides which links qualify", () => {
    const p = run("https://a.com/", [elem("img")], { test: () => true });
    expect(p.children).toHaveLength(5);
  });

  test("finds links nested in other elements", () => {
    const li = elem("li", {}, [
      elem("em", {}, [elem("a", { href: "https://a.com/" }, [text("x")])]),
    ]);
    rehypeWayback({ archives: { "https://a.com/": SNAPSHOT } })({
      type: "root",
      children: [elem("ul", {}, [li])],
    });
    expect((li.children[0] as HastElement).children).toHaveLength(3);
  });
});

describe("hasVisibleText", () => {
  test.each([
    [elem("a", {}, [text("x")]), true],
    [elem("a", {}, [text("  ")]), false],
    [elem("a", {}, [elem("span", { ariaHidden: "true" }, [text("x")])]), false],
    [elem("a", {}, [elem("span", { hidden: true }, [text("x")])]), false],
    [
      elem("a", {}, [
        elem("span", { className: ["visually-hidden"] }, [text("x")]),
      ]),
      false,
    ],
  ])("%#", (node, expected) => expect(hasVisibleText(node)).toBe(expected));
});
