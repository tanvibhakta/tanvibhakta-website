import { describe, expect, test } from "vitest";
import { shouldArchive } from "rehype-wayback/sync";
import { EXCLUDE, parsePost } from "../scripts/archive-links.ts";

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
