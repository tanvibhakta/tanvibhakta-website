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
} from "../src/utils/feeds";

// The real getCollection is overloaded against Astro's generated collection
// types; the tests drive it with plain fixture entries, so the mock uses this
// looser signature instead. `title` is optional because the notes collection
// is title-less.
type TestEntry = {
  id: string;
  collection: string;
  data: { title?: string; publishedOn: Date; draft?: boolean };
  body: string;
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
  render: vi.fn(() =>
    Promise.resolve({ Content: () => "<p>Mock content</p>" }),
  ),
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

// Mock @astrojs/rss
vi.mock("@astrojs/rss", () => ({
  default: mocks.rss,
}));

// Mock markdown-it and sanitize-html
vi.mock("markdown-it", () => {
  return {
    default: vi.fn(function (this: { render: (md: string) => string }) {
      this.render = vi.fn((md: string) => {
        // Simple markdown to HTML conversion for testing
        let html = md;
        html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/^([^\n]+)$/gm, "<p>$1</p>");
        return html;
      });
      return this;
    }),
  };
});

vi.mock("sanitize-html", () => {
  const sanitizeDefault = Object.assign(
    vi.fn((html: string) => html),
    { defaults: { allowedTags: ["b", "i", "em", "strong", "p", "br"] } },
  );
  return {
    default: sanitizeDefault,
  };
});

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

  it("should render markdown content to HTML in feed items", async () => {
    // Mock content with markdown
    const mockBlogEntry = {
      id: "test-post",
      collection: "blog",
      data: {
        title: "Test Post",
        publishedOn: new Date("2025-01-01"),
      },
      body: "# Hello World\n\nThis is a **test** post with markdown.",
    };

    mocks.getCollection.mockImplementation(async (_name, filter) => {
      const entries = _name === "blog" ? [mockBlogEntry] : [];
      return filter ? entries.filter(filter) : entries;
    });

    await generateMainFeed();

    // Check what was passed to the rss function
    const feedItems = rssCallOptions().items as RSSFeedItem[];

    // Verify the content is HTML, not markdown
    expect(feedItems[0].content).toContain("<h1>");
    expect(feedItems[0].content).toContain("<strong>");
    expect(feedItems[0].content).not.toContain("# Hello World");
    expect(feedItems[0].content).not.toContain("**test**");
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
      body: "Published content",
    };

    const mockDraftPost = {
      id: "draft-post",
      collection: "blog",
      data: {
        title: "Draft Post",
        publishedOn: new Date("2025-01-02"),
        draft: true,
      },
      body: "Draft content",
    };

    const mockNoDraftField = {
      id: "no-draft-field",
      collection: "blog",
      data: {
        title: "No Draft Field",
        publishedOn: new Date("2025-01-03"),
      },
      body: "Content without draft field",
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
        body: "poem",
      },
      {
        id: "draft",
        collection: "poetry",
        data: {
          title: "Draft Poem",
          publishedOn: new Date("2025-01-02"),
          draft: true,
        },
        body: "draft poem",
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
        body: "Just shipped a tiny new content type for short posts.",
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
