import { describe, test, expect, beforeAll } from "vitest";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { SITE_TAB_TITLE } from "../src/utils/site";
import { isNoteSlug } from "../src/utils/note-slug";

const execAsync = promisify(exec);

function extractTitle(html: string): string {
  const $ = cheerio.load(html);
  return $("title").text();
}

describe("Page Titles", () => {
  let distDir: string;

  beforeAll(async () => {
    await execAsync("pnpm run build");
    distDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );
  }, 120000);

  test("Homepage has no title prefix", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe(SITE_TAB_TITLE);
  });

  test("Work page derives its title from the route", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "work/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Work | Tanvi's Web Home");
  });

  test("Blog index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "blog/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe(`Blog | ${SITE_TAB_TITLE}`);
  });

  test("Poetry index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "poetry/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe(`Poetry | ${SITE_TAB_TITLE}`);
  });

  test("Weeknotes index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "weeknotes/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe(`Weeknotes | ${SITE_TAB_TITLE}`);
  });

  test("Digital Garden index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "digital-garden/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe(`Digital Garden | ${SITE_TAB_TITLE}`);
  });

  test("Notes index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "notes/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Notes | Tanvi's Web Home");
  });

  // Notes are permalinked at the root by day slug (/2026oct05-01). An empty
  // collection is a valid state (notes publish via Telegram, and the set can
  // be cleared); the per-note assertions only apply when notes exist.
  async function firstNoteHtml(): Promise<string | undefined> {
    const entries = await fs.promises.readdir(distDir);
    const note = entries.find((e) => isNoteSlug(e));
    if (!note) return undefined;
    return fs.promises.readFile(path.join(distDir, note, "index.html"), "utf8");
  }

  test("Note has date title with Notes suffix", async () => {
    const html = await firstNoteHtml();
    if (!html) return;
    expect(extractTitle(html)).toMatch(/^.+ \| Notes \| Tanvi's Web Home$/);
  });

  test("Note marks Notes as the current nav section", async () => {
    const html = await firstNoteHtml();
    if (!html) return;
    const $ = cheerio.load(html);
    const current = $('nav a[aria-current="page"]');
    expect(current.text().trim()).toBe("Notes");
    expect(current.attr("href")).toBe("/notes");
  });

  test("Note pages carry the site footer", async () => {
    const html = await firstNoteHtml();
    if (!html) return;
    expect(cheerio.load(html)('footer a[href="/sitemap"]').length).toBe(1);
  });

  test("Blog post has title with Blog suffix", async () => {
    const blogDir = path.join(distDir, "blog");
    const entries = await fs.promises.readdir(blogDir);
    const posts = entries.filter(
      (e) =>
        e !== "feed.xml" && fs.statSync(path.join(blogDir, e)).isDirectory(),
    );

    const html = await fs.promises.readFile(
      path.join(blogDir, posts[0], "index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toMatch(
      new RegExp(`^.+ \\| Blog \\| ${SITE_TAB_TITLE}$`),
    );
  });

  test("Weeknote has shortened title with Weeknote suffix", async () => {
    const weeknotesDir = path.join(distDir, "weeknotes");
    const entries = await fs.promises.readdir(weeknotesDir);
    const posts = entries.filter(
      (e) =>
        e !== "feed.xml" &&
        fs.statSync(path.join(weeknotesDir, e)).isDirectory(),
    );

    const html = await fs.promises.readFile(
      path.join(weeknotesDir, posts[0], "index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toMatch(
      new RegExp(`^.+ \\| Weeknote \\| ${SITE_TAB_TITLE}$`),
    );
  });

  test("Poetry post has title with Poetry suffix", async () => {
    const poetryDir = path.join(distDir, "poetry");
    const entries = await fs.promises.readdir(poetryDir);
    const posts = entries.filter(
      (e) =>
        e !== "feed.xml" && fs.statSync(path.join(poetryDir, e)).isDirectory(),
    );

    const html = await fs.promises.readFile(
      path.join(poetryDir, posts[0], "index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toMatch(
      new RegExp(`^.+ \\| Poetry \\| ${SITE_TAB_TITLE}$`),
    );
  });
});
