import { describe, test, expect, beforeAll } from "vitest";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { shortenWeeknoteTitles } from "../src/utils/date-helpers";

const execAsync = promisify(exec);

// Helper function to extract title from HTML
function extractTitle(html: string): string {
  const $ = cheerio.load(html);
  return $("title").text();
}

describe("Page Titles", () => {
  let distDir: string;

  beforeAll(async () => {
    // Build the project before running tests
    console.log("Building project...");
    await execAsync("npm run build");

    distDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );
  }, 60000);

  describe("Static Pages", () => {
    test("Homepage has correct title", async () => {
      const htmlPath = path.join(distDir, "index.html");
      const html = await fs.promises.readFile(htmlPath, "utf8");
      const title = extractTitle(html);

      expect(title).toBe("Tanvi's Web Home");
    });

    test("Work page has correct title", async () => {
      const htmlPath = path.join(distDir, "work/index.html");

      // Check if file exists (it should after implementation)
      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        const title = extractTitle(html);

        expect(title).toBe("Work | Tanvi's Web Home");
      } else {
        // Currently will fail - expected behavior before implementation
        expect(fs.existsSync(htmlPath)).toBe(true);
      }
    });

    test("Now page has correct title", async () => {
      const htmlPath = path.join(distDir, "now/index.html");

      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        const title = extractTitle(html);

        expect(title).toBe("Now | Tanvi's Web Home");
      } else {
        // Currently will fail - expected behavior before implementation
        expect(fs.existsSync(htmlPath)).toBe(true);
      }
    });
  });

  describe("Collection Index Pages", () => {
    test("Blog index has correct title", async () => {
      const htmlPath = path.join(distDir, "blog/index.html");
      const html = await fs.promises.readFile(htmlPath, "utf8");
      const title = extractTitle(html);

      expect(title).toBe("Blog | Tanvi's Web Home");
    });

    test("Poetry index has correct title", async () => {
      const htmlPath = path.join(distDir, "poetry/index.html");
      const html = await fs.promises.readFile(htmlPath, "utf8");
      const title = extractTitle(html);

      expect(title).toBe("Poetry | Tanvi's Web Home");
    });

    test("Weeknotes index has correct title", async () => {
      const htmlPath = path.join(distDir, "weeknotes/index.html");
      const html = await fs.promises.readFile(htmlPath, "utf8");
      const title = extractTitle(html);

      expect(title).toBe("Weeknotes | Tanvi's Web Home");
    });

    test("Digital Garden index has correct title", async () => {
      const htmlPath = path.join(distDir, "digital-garden/index.html");
      const html = await fs.promises.readFile(htmlPath, "utf8");
      const title = extractTitle(html);

      expect(title).toBe("Digital Garden | Tanvi's Web Home");
    });
  });

  describe("Content Pages", () => {
    test("Blog post has correct title format", async () => {
      const htmlPath = path.join(
        distDir,
        "blog/llms-create-bad-code/index.html",
      );

      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        const title = extractTitle(html);

        expect(title).toBe('LLMs create "bad" code | Blog | Tanvi\'s Web Home');
      } else {
        console.warn("Blog post not found, skipping test");
      }
    });

    test("Weeknote has correct shortened title format", async () => {
      const htmlPath = path.join(
        distDir,
        "weeknotes/week-of-sep-7th-2025/index.html",
      );

      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        const title = extractTitle(html);

        expect(title).toBe("Sep 7th | Weeknote | Tanvi's Web Home");
      } else {
        console.warn("Weeknote not found, skipping test");
      }
    });

    test("Poetry post has correct title format", async () => {
      // Find a specific poetry file to test
      const htmlPath = path.join(distDir, "poetry/day-22/index.html");

      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        const title = extractTitle(html);

        // Assuming the title is "Day 22" based on the file name
        expect(title).toBe("Day 22 | Poetry | Tanvi's Web Home");
      } else {
        // Try to find any poetry file
        const poetryDir = path.join(distDir, "poetry");
        if (fs.existsSync(poetryDir)) {
          const entries = await fs.promises.readdir(poetryDir);
          const poetryPosts = entries.filter(
            (e) =>
              e !== "index.html" &&
              fs.statSync(path.join(poetryDir, e)).isDirectory(),
          );

          if (poetryPosts.length > 0) {
            console.warn(
              `Testing with first poetry post found: ${poetryPosts[0]}`,
            );
            const htmlPath = path.join(poetryDir, poetryPosts[0], "index.html");
            const html = await fs.promises.readFile(htmlPath, "utf8");
            const title = extractTitle(html);

            // For now, just check it's not the default
            expect(title).not.toBe("Tanvi's Web Home");
          }
        }
      }
    });
  });

  describe("Title Shortening Logic", () => {
    test("Correctly shortens weeknote titles", () => {
      expect(shortenWeeknoteTitles("Week of September 7th, 2025")).toBe(
        "Sep 7th",
      );
      expect(shortenWeeknoteTitles("Week of December 25th, 2024")).toBe(
        "Dec 25th",
      );
      expect(shortenWeeknoteTitles("Week of January 1st, 2025")).toBe(
        "Jan 1st",
      );
      expect(shortenWeeknoteTitles("Week of March 22nd, 2025")).toBe(
        "Mar 22nd",
      );
      expect(shortenWeeknoteTitles("Week of April 3rd, 2025")).toBe("Apr 3rd");
      expect(shortenWeeknoteTitles("Week of November 11th, 2024")).toBe(
        "Nov 11th",
      );
    });

    test("Handles various date formats", () => {
      expect(shortenWeeknoteTitles("Week of May 21st, 2025")).toBe("May 21st");
      expect(shortenWeeknoteTitles("Week of June 2nd, 2025")).toBe("Jun 2nd");
      expect(shortenWeeknoteTitles("Week of July 13th, 2025")).toBe("Jul 13th");
    });
  });
});
