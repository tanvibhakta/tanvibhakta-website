import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FEED_CONFIG,
  isCollectionExcluded,
  isCollectionExcludedFromMainFeed,
  getEligibleCollections,
  getMainFeedEligibleCollections,
  generateMainFeed,
  generateCollectionFeed,
} from "../src/utils/feeds";

// Mock the astro:content module
vi.mock("astro:content", () => ({
  getCollection: vi.fn(() => Promise.resolve([])),
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
  default: vi.fn(
    () =>
      new Response('<?xml version="1.0"?><rss></rss>', {
        headers: { "Content-Type": "application/rss+xml" },
      }),
  ),
}));

// Mock markdown-it and sanitize-html
vi.mock("markdown-it", () => {
  return {
    default: vi.fn(function () {
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
  const sanitizeDefault = vi.fn((html: string) => html);
  sanitizeDefault.defaults = {
    allowedTags: ["b", "i", "em", "strong", "p", "br"],
  };
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
  },
}));

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
      ]);
    });

    it("should exclude collections from eligibility", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      const collections = getEligibleCollections();
      expect(collections).toEqual(["blog", "weeknotes", "digitalGarden"]);
      expect(collections).not.toContain("poetry");
    });

    it("should exclude multiple collections from eligibility", () => {
      FEED_CONFIG.excludedCollections = ["poetry", "weeknotes"];
      const collections = getEligibleCollections();
      expect(collections).toEqual(["blog", "digitalGarden"]);
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
      ]);
    });

    it("should exclude collections entirely when in excludedCollections", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual(["blog", "weeknotes", "digitalGarden"]);
      expect(collections).not.toContain("poetry");
    });

    it("should exclude collections from main feed when in excludeFromMainFeed", () => {
      FEED_CONFIG.excludeFromMainFeed = ["poetry"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual(["blog", "weeknotes", "digitalGarden"]);
      expect(collections).not.toContain("poetry");
    });

    it("should handle both exclusion types correctly", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      FEED_CONFIG.excludeFromMainFeed = ["weeknotes"];
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual(["blog", "digitalGarden"]);
      expect(collections).not.toContain("poetry");
      expect(collections).not.toContain("weeknotes");
    });

    it("should not duplicate exclusions", () => {
      FEED_CONFIG.excludedCollections = ["poetry"];
      FEED_CONFIG.excludeFromMainFeed = ["poetry"]; // Same collection in both
      const collections = getMainFeedEligibleCollections();
      expect(collections).toEqual(["blog", "weeknotes", "digitalGarden"]);
      expect(collections).not.toContain("poetry");
    });
  });
});

describe("Feed Content Generation", () => {
  beforeEach(async () => {
    FEED_CONFIG.excludedCollections = [];
    FEED_CONFIG.excludeFromMainFeed = [];

    // Reset mocks before each test
    const { getCollection: mockGetCollection } = await import("astro:content");
    const rssModule = await import("@astrojs/rss");
    vi.mocked(mockGetCollection).mockReset();
    vi.mocked(rssModule.default).mockReset();
  });

  it("should render markdown content to HTML in feed items", async () => {
    const { getCollection: mockGetCollection } = await import("astro:content");
    const rssModule = await import("@astrojs/rss");
    const mockRss = vi.mocked(rssModule.default);

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

    vi.mocked(mockGetCollection).mockResolvedValueOnce([mockBlogEntry]);

    await generateMainFeed();

    // Check what was passed to the rss function
    expect(mockRss).toHaveBeenCalled();
    const callArgs = mockRss.mock.calls[0][0];
    const feedItems = callArgs.items;

    // Verify the content is HTML, not markdown
    expect(feedItems[0].content).toContain("<h1>");
    expect(feedItems[0].content).toContain("<strong>");
    expect(feedItems[0].content).not.toContain("# Hello World");
    expect(feedItems[0].content).not.toContain("**test**");
  });

  it("should exclude draft posts from the main feed", async () => {
    const { getCollection: mockGetCollection } = await import("astro:content");
    const rssModule = await import("@astrojs/rss");
    const mockRss = vi.mocked(rssModule.default);

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

    vi.mocked(mockGetCollection)
      .mockResolvedValueOnce([
        mockPublishedPost,
        mockDraftPost,
        mockNoDraftField,
      ])
      .mockResolvedValue([]);

    mockRss.mockReturnValue(
      new Response('<?xml version="1.0"?><rss></rss>', {
        headers: { "Content-Type": "application/rss+xml" },
      }),
    );

    await generateMainFeed();

    expect(mockRss).toHaveBeenCalled();
    const callArgs = mockRss.mock.calls[0][0];
    const feedItems = callArgs.items;

    // Should include published and no-draft-field, exclude draft
    expect(feedItems).toHaveLength(2);
    expect(feedItems.map((item) => item.title)).not.toContain(
      expect.stringContaining("Draft Post"),
    );
  });

  it("should exclude draft posts from collection feeds", async () => {
    const { getCollection: mockGetCollection } = await import("astro:content");
    const rssModule = await import("@astrojs/rss");
    const mockRss = vi.mocked(rssModule.default);

    vi.mocked(mockGetCollection).mockResolvedValue([
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
    ]);

    mockRss.mockReturnValue(
      new Response('<?xml version="1.0"?><rss></rss>', {
        headers: { "Content-Type": "application/rss+xml" },
      }),
    );

    await generateCollectionFeed("poetry");

    expect(mockRss).toHaveBeenCalled();
    const callArgs = mockRss.mock.calls[0][0];
    expect(callArgs.items).toHaveLength(1);
    expect(callArgs.items[0].title).toBe("Published Poem");
  });
});
