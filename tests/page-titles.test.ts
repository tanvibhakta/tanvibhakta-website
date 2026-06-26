import { describe, test, expect, beforeAll } from "vitest";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

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
    expect(extractTitle(html)).toBe("Tanvi's Web Home");
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
    expect(extractTitle(html)).toBe("Blog | Tanvi's Web Home");
  });

  test("Poetry index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "poetry/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Poetry | Tanvi's Web Home");
  });

  test("Weeknotes index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "weeknotes/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Weeknotes | Tanvi's Web Home");
  });

  test("Digital Garden index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "digital-garden/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Digital Garden | Tanvi's Web Home");
  });

  test("Notes index has correct title", async () => {
    const html = await fs.promises.readFile(
      path.join(distDir, "notes/index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toBe("Notes | Tanvi's Web Home");
  });

  test("Note has date title with Notes suffix", async () => {
    const notesDir = path.join(distDir, "notes");
    const entries = await fs.promises.readdir(notesDir);
    const posts = entries.filter(
      (e) =>
        e !== "feed.xml" && fs.statSync(path.join(notesDir, e)).isDirectory(),
    );

    // Notes are permalinked by an xkcd-style sequential number.
    expect(posts.every((p) => /^\d+$/.test(p))).toBe(true);
    expect(posts).toContain("1");

    const html = await fs.promises.readFile(
      path.join(notesDir, posts[0], "index.html"),
      "utf8",
    );
    expect(extractTitle(html)).toMatch(/^.+ \| Notes \| Tanvi's Web Home$/);
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
    expect(extractTitle(html)).toMatch(/^.+ \| Blog \| Tanvi's Web Home$/);
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
    expect(extractTitle(html)).toMatch(/^.+ \| Weeknote \| Tanvi's Web Home$/);
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
    expect(extractTitle(html)).toMatch(/^.+ \| Poetry \| Tanvi's Web Home$/);
  });
});
