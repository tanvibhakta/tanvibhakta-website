import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FEED_CONFIG,
  isCollectionExcluded,
  isCollectionExcludedFromMainFeed,
  getEligibleCollections,
  getMainFeedEligibleCollections,
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
