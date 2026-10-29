import { describe, expect, test } from "vitest";
import { shouldArchive } from "rehype-wayback/sync";
import { EXCLUDE, outage, parsePost } from "../scripts/archive-links.ts";

describe("parsePost", () => {
  test("splits frontmatter and reads publishedOn as YYYYMMDD", () => {
    const post = parsePost(
      "---\ntitle: Hi\npublishedOn: 2024-03-05T10:00\n---\n\nbody",
    );
    expect(post).toEqual({ markdown: "\nbody", date: "20240305" });
  });
  test("falls back to lastUpdatedOn", () => {
    expect(parsePost("---\nlastUpdatedOn: 2023-01-02\n---\nx").date).toBe(
      "20230102",
    );
  });
  test("flags drafts", () => {
    expect(parsePost("---\ntitle: x\ndraft: true\n---\nbody").draft).toBe(true);
    expect(parsePost("---\ndraft: false\n---\nbody")).not.toHaveProperty(
      "draft",
    );
  });
  test("no frontmatter → whole text, no date", () => {
    expect(parsePost("just text")).toEqual({ markdown: "just text" });
  });
});

describe("EXCLUDE", () => {
  test.each([
    "https://www.goodreads.com/book/show/1",
    "https://open.spotify.com/track/1",
    "https://www.instagram.com/p/1",
    "https://tanvibhakta.in/blog/",
    "https://www.tanvibhakta.in/",
    "https://docs.google.com/document/d/1",
    "https://letterboxd.com/film/aftersun/",
    "https://www.imdb.com/title/tt0111161/",
    "https://m.imdb.com/title/tt0111161/",
  ])("%s is never archived", (href) =>
    expect(shouldArchive(href, EXCLUDE)).toBe(false),
  );

  test.each(["https://en.wikipedia.org/wiki/X", "https://github.com/a/b"])(
    "%s is archived",
    (href) => expect(shouldArchive(href, EXCLUDE)).toBe(true),
  );
});

describe("outage", () => {
  test("rejected keys fail the run", () => {
    expect(
      outage({ requests: 100, requestErrors: 1, authFailed: true }),
    ).toMatch(/401\/403/);
  });
  test("more than half the requests failing fails the run", () => {
    expect(
      outage({ requests: 10, requestErrors: 6, authFailed: false }),
    ).toMatch(/6 of 10/);
  });
  test("misses and a few errors are fine", () => {
    expect(
      outage({ requests: 10, requestErrors: 5, authFailed: false }),
    ).toBeNull();
    expect(
      outage({ requests: 0, requestErrors: 0, authFailed: false }),
    ).toBeNull();
  });
});
