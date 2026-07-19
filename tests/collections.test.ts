import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  byPublishedOn,
  newestFirst,
  getPublishedEntriesSorted,
} from "../src/utils/collections";

// Mock the astro:content module
vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
}));

// Mock the content config to avoid import issues
vi.mock("../src/content.config", () => ({
  collections: {
    blog: {},
    weeknotes: {},
    poetry: {},
    digitalGarden: {},
    pages: {},
  },
  COLLECTION_SEGMENTS: {
    blog: "blog",
    weeknotes: "weeknotes",
    poetry: "poetry",
    digitalGarden: "digital-garden",
    pages: "",
  },
  SECTIONS: {
    blog: { href: "/blog", title: "Blog", description: "" },
    poetry: { href: "/poetry", title: "Poetry", description: "" },
    weeknotes: { href: "/weeknotes", title: "Weeknotes", description: "" },
    digitalGarden: {
      href: "/digital-garden",
      title: "Digital Garden",
      description: "",
    },
  },
}));

import { getCollection } from "astro:content";

const entry = (id: string, publishedOn: string, draft = false) => ({
  id,
  data: { publishedOn: new Date(publishedOn), draft },
});

describe("byPublishedOn", () => {
  it("orders entries chronologically, oldest first", () => {
    const posts = [
      entry("newest", "2026-02-08T23:00:00+05:30"),
      entry("oldest", "2025-04-03"),
      entry("middle", "2025-04-06"),
    ];
    expect(posts.sort(byPublishedOn).map((p) => p.id)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });

  it("breaks identical-timestamp ties on id, not input order", () => {
    // Legacy date-only frontmatter all parses to midnight UTC; the id
    // tie-break keeps ordering deterministic regardless of file discovery.
    const posts = [
      entry("day-2", "2025-04-03"),
      entry("day-0", "2025-04-03"),
      entry("day-1", "2025-04-03"),
    ];
    expect(posts.sort(byPublishedOn).map((p) => p.id)).toEqual([
      "day-0",
      "day-1",
      "day-2",
    ]);
  });
});

describe("newestFirst", () => {
  it("is the exact reverse of byPublishedOn", () => {
    const posts = [
      entry("a", "2025-01-01"),
      entry("b", "2026-01-01"),
      entry("c", "2025-06-01"),
    ];
    const ascending = [...posts].sort(byPublishedOn).map((p) => p.id);
    const descending = [...posts].sort(newestFirst).map((p) => p.id);
    expect(descending).toEqual(ascending.toReversed());
  });
});

describe("getPublishedEntriesSorted", () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockImplementation(
      (_name: string, filter?: (entry: unknown) => boolean) => {
        const entries = [
          entry("draft-post", "2026-05-01", true),
          entry("old-post", "2025-04-03"),
          entry("new-post", "2026-02-08"),
        ];
        return Promise.resolve(filter ? entries.filter(filter) : entries);
      },
    );
  });

  it("defaults to newest first and excludes drafts", async () => {
    const sorted = await getPublishedEntriesSorted("blog");
    expect(sorted.map((p) => p.id)).toEqual(["new-post", "old-post"]);
  });

  it("returns oldest first for prev/next reading order", async () => {
    const sorted = await getPublishedEntriesSorted("blog", "oldestFirst");
    expect(sorted.map((p) => p.id)).toEqual(["old-post", "new-post"]);
  });
});
