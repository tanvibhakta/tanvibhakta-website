import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { shouldArchive } from "rehype-wayback/sync";
import {
  EXCLUDE,
  missingKeys,
  outage,
  parseFlags,
  parsePost,
  sampleLinks,
  summarizeTimings,
  writeAtomic,
} from "../scripts/archive-links.ts";

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
    expect(outage({ authFailed: true })).toMatch(/401\/403/);
  });
  test("anything else, however many requests failed, doesn't", () => {
    expect(outage({ authFailed: false })).toBeNull();
  });
});

describe("missingKeys", () => {
  const keys = { ARCHIVE_ORG_ACCESS_KEY: "a", ARCHIVE_ORG_SECRET_KEY: "s" };
  test("GitHub Actions without both keys can't start", () => {
    expect(missingKeys({ GITHUB_ACTIONS: "true" })).toMatch(/secrets/);
    expect(
      missingKeys({ GITHUB_ACTIONS: "true", ARCHIVE_ORG_ACCESS_KEY: "a" }),
    ).toMatch(/secrets/);
  });
  test("Actions with keys, or any local run, can", () => {
    expect(missingKeys({ GITHUB_ACTIONS: "true", ...keys })).toBeNull();
    expect(missingKeys({})).toBeNull();
  });
});

describe("writeAtomic", () => {
  test("replaces the file and leaves no temp file behind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "archive-"));
    const path = join(dir, "data.json");
    await writeFile(path, "old");
    await writeAtomic(path, "new");
    expect(await readFile(path, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["data.json"]);
    await rm(dir, { recursive: true });
  });
});

describe("parseFlags", () => {
  test("defaults", () => {
    expect(parseFlags([])).toEqual({
      sample: undefined,
      maxCaptures: undefined,
      requestTimeoutMs: undefined,
    });
  });
  test("reads every flag", () => {
    expect(
      parseFlags([
        "--sample",
        "25",
        "--max-captures",
        "5",
        "--request-timeout-ms",
        "300000",
      ]),
    ).toEqual({
      sample: 25,
      maxCaptures: 5,
      requestTimeoutMs: 300000,
    });
  });
  test.each([
    [["--sample", "abc"]],
    [["--sample", "-1"]],
    [["--max-captures", "2.5"]],
    [["--dry-run"]],
    [["--unknown"]],
  ])("rejects %j", (args) => {
    expect(() => parseFlags(args)).toThrow();
  });
});

describe("sampleLinks", () => {
  const links = new Map([
    ["a", "1"],
    ["b", "2"],
    ["c", "3"],
    ["d", "4"],
  ]);
  test("picks n distinct entries, keeping their values", () => {
    const sample = sampleLinks(links, 2, () => 0.99);
    expect(sample.size).toBe(2);
    for (const [k, v] of sample) expect(links.get(k)).toBe(v);
  });
  test("is deterministic for a given random source", () => {
    expect([...sampleLinks(links, 2, () => 0).keys()]).toEqual(["a", "b"]);
    expect([...sampleLinks(links, 2, () => 0.99).keys()]).toEqual(["d", "a"]);
  });
  test("n at or above the size returns everything; 0 returns nothing", () => {
    expect(sampleLinks(links, 10).size).toBe(4);
    expect(sampleLinks(links, 0).size).toBe(0);
  });
  test("leaves the input alone", () => {
    sampleLinks(links, 2);
    expect([...links.keys()]).toEqual(["a", "b", "c", "d"]);
  });
});

describe("summarizeTimings", () => {
  test("per kind: count, median, p90, max, thresholds and errors", () => {
    const lookup = (ms: number, extra = {}) => ({
      kind: "lookup" as const,
      url: "u",
      ms,
      status: 200,
      ...extra,
    });
    const summary = summarizeTimings([
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => lookup(s * 1000)),
      lookup(45_000, { status: 503 }),
      { kind: "capture-total", url: "u", ms: 70_000, error: "timed out" },
    ]);
    expect(summary.lookup).toEqual({
      count: 10,
      median: 5.5,
      p90: 9,
      max: 45,
      over10s: 1,
      over30s: 1,
      over60s: 0,
      errors: 1,
    });
    expect(summary["capture-total"]).toEqual({
      count: 1,
      median: 70,
      p90: 70,
      max: 70,
      over10s: 1,
      over30s: 1,
      over60s: 1,
      errors: 1,
    });
  });
  test("no requests, no summary", () => {
    expect(summarizeTimings([])).toEqual({});
  });
});
