import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RSSFeedItem, RSSOptions } from "@astrojs/rss";
import {
  FEED_CONFIG,
  isCollectionExcluded,
  isCollectionExcludedFromMainFeed,
  getEligibleCollections,
  getMainFeedEligibleCollections,
  generateMainFeed,
  generateCollectionFeed,
  noteReplyPrefix,
} from "../src/utils/feeds";

// The real getCollection is overloaded against Astro's generated collection
// types; the tests drive it with plain fixture entries, so the mock uses this
// looser signature instead. `title` is optional because the notes collection
// is title-less.
type TestEntry = {
  id: string;
  collection: string;
  data: { title?: string; publishedOn: Date; draft?: boolean };
  html?: string;
  filePath?: string;
};

// vi.hoisted gives the vi.mock factories and the tests one shared, properly
// typed mock instance — no casts or dynamic imports at the call sites.
// mockReset() in beforeEach restores these default implementations.
const mocks = vi.hoisted(() => ({
  getCollection: vi.fn(
    async (_name: string, filter?: (entry: TestEntry) => boolean) => {
      const entries: TestEntry[] = [];
      return filter ? entries.filter(filter) : entries;
    },
  ),
  rss: vi.fn<(options: RSSOptions) => Promise<Response>>(
    async () =>
      new Response('<?xml version="1.0"?><rss></rss>', {
        headers: { "Content-Type": "application/rss+xml" },
      }),
  ),
}));

// Mock the astro:content module
vi.mock("astro:content", () => ({
  getCollection: mocks.getCollection,
  defineCollection: vi.fn(),
  // The container mock below "renders" Content by returning it, so each
  // fixture's html is what the feed sees as the page's rendered HTML.
  render: vi.fn(async (entry: TestEntry) => ({ Content: entry.html })),
  z: {
    object: vi.fn(() => ({ string: vi.fn(), date: vi.fn() })),
    string: vi.fn(),
    date: vi.fn(),
  },
}));

// Mock astro/loaders
vi.mock("astro/loaders", () => ({
  glob: vi.fn(),
}));

// Mock the Container API and MDX's server renderer; both need Astro's build.
vi.mock("astro/container", () => ({
  experimental_AstroContainer: {
    create: vi.fn(async () => ({
      addServerRenderer: vi.fn(),
      renderToString: vi.fn(async (content: string) => content),
    })),
  },
}));
vi.mock("@astrojs/mdx/server.js", () => ({ default: {} }));

// Mock @astrojs/rss
vi.mock("@astrojs/rss", () => ({
  default: mocks.rss,
}));

// title-markdown builds its own parser from markdown-it, which the mock above
// can't serve. Its behavior has its own tests; here titles pass through as-is.
vi.mock("../src/utils/title-markdown", () => ({
  titleText: (title: string) => title,
}));

// Mock the content config to avoid import issues
vi.mock("../src/content.config", () => ({
  collections: {
    blog: {},
    weeknotes: {},
    poetry: {},
    digitalGarden: {},
    notes: {},
  },
  COLLECTION_SEGMENTS: {
    blog: "blog",
    weeknotes: "weeknotes",
    poetry: "poetry",
    digitalGarden: "digital-garden",
    notes: "notes",
    pages: "",
  },
}));

/** The RSSOptions the mocked rss() received on its first call. */
function rssCallOptions(): RSSOptions {
  expect(mocks.rss).toHaveBeenCalled();
  return mocks.rss.mock.calls[0][0];
}

describe("Feed Configuration", () => {
  beforeEach(() => {
    // Reset configuration before each test
    FEED_CONFIG.excludedCollections = [];
    FEED_CONFIG.excludeFromMainFeed = [];
  });

  describe("isCollectionExcluded", () => {
    it("should return false when collection is not excluded", () => {
      expect(isCollectionExcluded("blog")).toBe(false);
      expect(isCollectionExcluded("poetry")).toBe(false);
      expect(isCollectionExcluded("weeknotes")).toBe(false);
    });

    it("should return true when collection is excluded", () => {
      FEED_CONFIG.excludedCollections = ["poetry", "drafts"];

      expect(isCollectionExcluded("poetry")).toBe(true);
      expect(isCollectionExcluded("drafts")).toBe(true);
      expect(isCollectionExcluded("blog")).toBe(false);
      expect(isCollectionExcluded("weeknotes")).toBe(false);
    });
  });

  describe("isCollectionExcludedFromMainFeed", () => {
    it("should return false when collection is not excluded from main feed", () => {
      expect(isCollectionExcludedFromMainFeed("blog")).toBe(false);
      expect(isCollectionExcludedFromMainFeed("poetry")).toBe(false);
      expect(isCollectionExcludedFromMainFeed("weeknotes")).toBe(false);
    });

    it("should return true when collection is excluded from main feed", () => {
      FEED_CONFIG.excludeFromMainFeed = ["poetry", "drafts"];

      expect(isCollectionExcludedFromMainFeed("poetry")).toBe(true);
      expect(isCollectionExcludedFromMainFeed("drafts")).toBe(true);
      expect(isCollectionExcludedFromMainFeed("blog")).toBe(false);
      expect(isCollectionExcludedFromMainFeed("weeknotes")).toBe(false);
    });
  });

  describe("getEligibleCollections", () => {
    it("should return all collections when none are excluded", () => {
      const collections = getEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "poetry",
        "digitalGarden",
        "notes",
      ]);
    });

    it("should exclude collections from eligibility", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      const collections = getEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "digitalGarden",
        "notes",
      ]);
      expect(collections).not.toContain("poetry");
    });

    it("should exclude multiple collections from eligibility", () => {
      FEED_CONFIG.excludedCollections = ["poetry", "weeknotes"];
      const collections = getEligibleCollections();
      expect(collections).toEqual(["blog", "digitalGarden", "notes"]);
      expect(collections).not.toContain("poetry");
      expect(collections).not.toContain("weeknotes");
    });
  });

  describe("getMainFeedEligibleCollections", () => {
    it("should return all collections when none are excluded", () => {
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "poetry",
        "digitalGarden",
        "notes",
      ]);
    });

    it("should exclude collections entirely when in excludedCollections", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "digitalGarden",
        "notes",
      ]);
      expect(collections).not.toContain("poetry");
    });

    it("should exclude collections from main feed when in excludeFromMainFeed", () => {
      FEED_CONFIG.excludeFromMainFeed = ["poetry"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "digitalGarden",
        "notes",
      ]);
      expect(collections).not.toContain("poetry");
    });

    it("should handle both exclusion types correctly", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      FEED_CONFIG.excludeFromMainFeed = ["weeknotes"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual(["blog", "digitalGarden", "notes"]);
      expect(collections).not.toContain("poetry");
      expect(collections).not.toContain("weeknotes");
    });

    it("should not duplicate exclusions", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      FEED_CONFIG.excludeFromMainFeed = ["poetry"]; // Same collection in both
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual([
        "blog",
        "weeknotes",
        "digitalGarden",
        "notes",
      ]);
      expect(collections).not.toContain("poetry");
    });

    it("excludes notes from the main feed by default", () => {
      // Restore the real default the app ships with
      FEED_CONFIG.excludeFromMainFeed = ["notes"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).not.toContain("notes");
      expect(getEligibleCollections()).toContain("notes");
    });
  });
});

describe("Feed Content Generation", () => {
  beforeEach(() => {
    FEED_CONFIG.excludedCollections = [];
    FEED_CONFIG.excludeFromMainFeed = [];

    // Restores the default implementations from vi.hoisted above
    mocks.getCollection.mockReset();
    mocks.rss.mockReset();
  });

  it("uses the site's rendered HTML, minus site-only chrome", async () => {
    const mockBlogEntry = {
      id: "test-post",
      collection: "blog",
      data: {
        title: "Test Post",
        publishedOn: new Date("2025-01-01"),
      },
      // What the content layer stores after the site's remark/rehype run.
      html: '<h1>Hello World</h1><p id="p-1">A <strong>test</strong><br>post<a href="#p-1" class="anchor-link"> #</a></p>',
      filePath: "posts/blog/test-post.md",
    };

    mocks.getCollection.mockImplementation(async (_name, filter) => {
      const entries = _name === "blog" ? [mockBlogEntry] : [];
      return filter ? entries.filter(filter) : entries;
    });

    await generateMainFeed();

    const feedItems = rssCallOptions().items as RSSFeedItem[];
    expect(feedItems[0].content).toBe(
      "<h1>Hello World</h1><p>A <strong>test</strong><br />post</p>",
    );
    // The feed names its own URL, as validators expect.
    expect(rssCallOptions().customData).toContain(
      'href="https://tanvibhakta.in/feed.xml" rel="self"',
    );
  });

  it("should exclude draft posts from the main feed", async () => {
    const mockPublishedPost = {
      id: "published-post",
      collection: "blog",
      data: {
        title: "Published Post",
        publishedOn: new Date("2025-01-01"),
        draft: false,
      },
      html: "<p>Published content</p>",
      filePath: "posts/blog/published-post.md",
    };

    const mockDraftPost = {
      id: "draft-post",
      collection: "blog",
      data: {
        title: "Draft Post",
        publishedOn: new Date("2025-01-02"),
        draft: true,
      },
      html: "<p>Draft content</p>",
      filePath: "posts/blog/draft-post.md",
    };

    const mockNoDraftField = {
      id: "no-draft-field",
      collection: "blog",
      data: {
        title: "No Draft Field",
        publishedOn: new Date("2025-01-03"),
      },
      html: "<p>Content without draft field</p>",
      filePath: "posts/blog/no-draft-field.md",
    };

    const allEntries = [mockPublishedPost, mockDraftPost, mockNoDraftField];
    mocks.getCollection.mockImplementation(async (_name, filter) => {
      const entries = _name === "blog" ? allEntries : [];
      return filter ? entries.filter(filter) : entries;
    });

    await generateMainFeed();

    const feedItems = rssCallOptions().items as RSSFeedItem[];

    // Should include published and no-draft-field, exclude draft
    expect(feedItems).toHaveLength(2);
    const titles = feedItems.map((item) => item.title);
    expect(titles.filter((title) => title?.includes("Draft Post"))).toEqual([]);
  });

  it("should exclude draft posts from collection feeds", async () => {
    const poetryEntries = [
      {
        id: "pub",
        collection: "poetry",
        data: { title: "Published Poem", publishedOn: new Date("2025-01-01") },
        html: "<p>poem</p>",
        filePath: "posts/poetry/pub.md",
      },
      {
        id: "draft",
        collection: "poetry",
        data: {
          title: "Draft Poem",
          publishedOn: new Date("2025-01-02"),
          draft: true,
        },
        html: "<p>draft poem</p>",
        filePath: "posts/poetry/draft.md",
      },
    ];
    mocks.getCollection.mockImplementation(async (_name, filter) =>
      filter ? poetryEntries.filter(filter) : poetryEntries,
    );

    await generateCollectionFeed("poetry");

    const feedItems = rssCallOptions().items as RSSFeedItem[];
    expect(feedItems).toHaveLength(1);
    expect(feedItems[0].title).toBe("Published Poem");
    // Titled collections store real dates; pubDate passes through unchanged.
    expect(feedItems[0].pubDate).toEqual(new Date("2025-01-01"));
  });

  it("should use the publish date as the feed title for title-less notes", async () => {
    const noteEntries = [
      {
        id: "2026-06-21-1200",
        collection: "notes",
        data: { publishedOn: new Date("2026-06-21T12:00:00Z") },
        html: "<p>Just shipped a tiny new content type for short posts.</p>",
        filePath: "posts/notes/2026-06-21-1200.md",
      },
    ];
    mocks.getCollection.mockImplementation(async (_name, filter) =>
      filter ? noteEntries.filter(filter) : noteEntries,
    );

    await generateCollectionFeed("notes");

    const feedItems = rssCallOptions().items as RSSFeedItem[];
    // Title-less notes fall back to their formatted date, never the body.
    expect(feedItems[0].title).toMatch(/^[A-Z][a-z]+ \d{1,2}, 2026$/);
    expect(feedItems[0].title).not.toContain("shipped");
    // Notes store naive IST wall clocks; pubDate must be the true instant.
    expect(feedItems[0].pubDate?.toISOString()).toBe(
      "2026-06-21T06:30:00.000Z",
    );
  });
});

describe("noteReplyPrefix", () => {
  it("links a reply's parent note by its slug", () => {
    const prefix = noteReplyPrefix("2026oct05-02");
    expect(prefix).toMatch(
      /^<p>↳ replying to <a href="[^"]+\/2026oct05-02\/">2026oct05-02<\/a><\/p>$/,
    );
  });

  it("is empty when the parent no longer exists", () => {
    expect(noteReplyPrefix(undefined)).toBe("");
  });
});
