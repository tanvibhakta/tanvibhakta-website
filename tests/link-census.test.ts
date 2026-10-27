import { describe, expect, test } from "vitest";
import {
  buildLinkCensus,
  classifyLink,
  extractLinks,
} from "../src/utils/link-census";

describe("extractLinks", () => {
  test("finds markdown, autolinked, reference and raw HTML links but not images", () => {
    const md = [
      "A [post](/blog/a) and https://example.com/bare.",
      "![pic](images/x.webp) and a [ref][r].",
      '<a href="https://html.example/">html</a>',
      "",
      "[r]: https://ref.example/page",
    ].join("\n");
    expect(extractLinks(md)).toEqual([
      "/blog/a",
      "https://example.com/bare",
      "https://ref.example/page",
      "https://html.example/",
    ]);
  });
});

describe("classifyLink", () => {
  test("own-domain and relative links are internal, normalised", () => {
    expect(
      classifyLink("https://www.tanvibhakta.in/blog/x/#p-3", "/weeknotes/y"),
    ).toEqual({ kind: "internal", target: "/blog/x" });
    expect(classifyLink("../blog/x?a=1", "/weeknotes/y")).toEqual({
      kind: "internal",
      target: "/blog/x",
    });
  });

  test("other hosts are outgoing, grouped by bare domain", () => {
    expect(classifyLink("https://www.example.com/a/#top", "/")).toEqual({
      kind: "outgoing",
      target: "https://www.example.com/a",
      domain: "example.com",
    });
  });

  test("anchors and non-web schemes are skipped", () => {
    expect(classifyLink("#p-2", "/")).toBeNull();
    expect(classifyLink("mailto:me@tanvibhakta.in", "/")).toBeNull();
  });
});

describe("buildLinkCensus", () => {
  test("ranks targets by count and tracks distinct source pages", () => {
    const census = buildLinkCensus([
      {
        href: "/blog/a",
        body: "[x](https://en.wikipedia.org/wiki/X) [y](https://en.wikipedia.org/wiki/X) [z](/blog/b)",
      },
      {
        href: "/blog/c",
        body: "[w](https://en.wikipedia.org/wiki/W) [g](https://github.com) [b](/blog/b/)",
      },
    ]);
    expect(census.total).toBe(6);
    expect(census.internal).toEqual([
      { target: "/blog/b", count: 2, sources: 2 },
    ]);
    expect(census.outgoing.map((d) => [d.target, d.count, d.sources])).toEqual([
      ["en.wikipedia.org", 3, 2],
      ["github.com", 1, 1],
    ]);
    expect(census.outgoing[0].urls[0]).toEqual({
      target: "https://en.wikipedia.org/wiki/X",
      count: 2,
      sources: 1,
    });
  });
});
