import { describe, expect, test } from "vitest";
import {
  buildLinkCensus,
  classifyLink,
  extractLinks,
  groupOutgoing,
  matchesSite,
  type OutgoingLink,
} from "../src/utils/link-census";
import people from "../src/data/people.json";
import platforms from "../src/data/platforms.json";

const outgoing = (url: string): OutgoingLink => {
  const link = classifyLink(url, "/");
  if (link?.kind !== "outgoing") throw new Error(`not outgoing: ${url}`);
  return link;
};

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
  test("ranks internal targets and keeps outgoing links in order", () => {
    const census = buildLinkCensus([
      { href: "/blog/a", body: "[x](https://github.com/a) [z](/blog/b)" },
      { href: "/blog/c", body: "[b](/blog/b/) [d](/care) [y](https://x.com)" },
    ]);
    expect(census.internal).toEqual([
      { target: "/blog/b", count: 2 },
      { target: "/care", count: 1 },
    ]);
    expect(census.outgoing.map((l) => l.target)).toEqual([
      "https://github.com/a",
      "https://x.com",
    ]);
  });
});

describe("matchesSite", () => {
  test("a bare domain covers its subdomains but not lookalikes", () => {
    expect(
      matchesSite(outgoing("https://blog.azan-n.com/p"), "azan-n.com"),
    ).toBe(true);
    expect(matchesSite(outgoing("https://notazan-n.com"), "azan-n.com")).toBe(
      false,
    );
  });

  test("a domain with a path covers that profile and below only", () => {
    const site = "instagram.com/barkwhip";
    expect(
      matchesSite(outgoing("https://www.instagram.com/barkwhip/"), site),
    ).toBe(true);
    expect(
      matchesSite(outgoing("https://instagram.com/barkwhip/p/1?hl=en"), site),
    ).toBe(true);
    expect(
      matchesSite(outgoing("https://instagram.com/barkwhipped"), site),
    ).toBe(false);
  });
});

describe("groupOutgoing", () => {
  test("files people first, then platforms, then everything else by domain", () => {
    const sections = groupOutgoing(
      [
        "https://www.instagram.com/barkwhip/",
        "https://instagram.com/someone-else",
        "https://en.wikipedia.org/wiki/X",
        "https://en.m.wikipedia.org/wiki/X",
        "https://ankursethi.com/a",
        "https://ankursethi.in",
        "https://ankursethi.com/a",
        "https://example.org/post",
      ].map(outgoing),
      [
        { name: "Pranav", sites: ["instagram.com/barkwhip"] },
        { name: "Ankur", sites: ["ankursethi.com", "ankursethi.in"] },
      ],
      { Aggregators: ["instagram.com"], References: ["wikipedia.org"] },
    );
    const summary = sections.map((s) => [
      s.heading,
      s.groups.map((g) => [g.label, g.count]),
    ]);
    expect(summary).toEqual([
      [
        "People",
        [
          ["Ankur", 3],
          ["Pranav", 1],
        ],
      ],
      ["Blogs & Publications", [["example.org", 1]]],
      ["Aggregators", [["instagram.com", 1]]],
      ["References", [["wikipedia.org", 2]]],
    ]);
    expect(sections[0].groups[0].urls).toEqual([
      { target: "https://ankursethi.com/a", count: 2 },
      { target: "https://ankursethi.in", count: 1 },
    ]);
  });
});

describe("data files", () => {
  // Sites are matched as "domain" or "domain/path"; a scheme, www. or a
  // stray uppercase letter would silently never match.
  const SITE = /^(?!www\.)[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/;

  test("people.json entries are named and every site is well-formed", () => {
    for (const person of people) {
      expect(person.name.trim()).not.toBe("");
      expect(person.sites.length).toBeGreaterThan(0);
      for (const site of person.sites) expect(site).toMatch(SITE);
    }
  });

  test("platforms.json domains are well-formed and filed once", () => {
    const domains = Object.values(platforms).flat();
    for (const domain of domains) expect(domain).toMatch(SITE);
    expect(new Set(domains).size).toBe(domains.length);
  });
});
