import { describe, expect, test } from "vitest";
import rehypeWayback from "../index.js";

type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const SNAPSHOT = "https://web.archive.org/web/20240101000000/https://a.com/";
const link = (href: string): Node => ({
  type: "element",
  tagName: "a",
  properties: { href },
  children: [{ type: "text" }],
});

/** Runs the plugin over the links, nested in a <p> inside an <li>. */
function run(...links: Node[]) {
  rehypeWayback({ archives: { "https://a.com/": SNAPSHOT } })({
    type: "root",
    children: [
      {
        type: "element",
        tagName: "li",
        properties: {},
        children: [
          { type: "element", tagName: "p", properties: {}, children: links },
        ],
      },
    ],
  });
  return links;
}

describe("rehypeWayback", () => {
  test("adds data-archive to links with a snapshot, however deeply nested", () => {
    const [a] = run(link("https://a.com/"));
    expect(a.properties).toEqual({
      href: "https://a.com/",
      dataArchive: SNAPSHOT,
    });
  });

  test("matches regardless of fragment and host case", () => {
    const [a] = run(link("https://A.com/#section"));
    expect(a.properties?.dataArchive).toBe(SNAPSHOT);
  });

  test("leaves other links, and the content of links, alone", () => {
    const links = run(link("https://b.com/"), link("/a"), link("#x"));
    for (const a of links)
      expect(a.properties).not.toHaveProperty("dataArchive");
    expect(run(link("https://a.com/"))[0].children).toEqual([{ type: "text" }]);
  });
});
