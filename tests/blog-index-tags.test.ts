import { describe, test, expect, beforeAll } from "vitest";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

describe("Blog index tags", () => {
  let $: cheerio.CheerioAPI;

  beforeAll(async () => {
    await execAsync("pnpm run build");
    const distDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );
    const html = await fs.promises.readFile(
      path.join(distDir, "blog/index.html"),
      "utf8",
    );
    $ = cheerio.load(html);
  }, 120000);

  test("tagged post shows its tags as links to the tag page", () => {
    const row = $('a[href="/blog/cursor-ux-issues"]').closest("li");
    expect(row.length).toBe(1);
    const tagLinks = row.find('a[href="/tags/ai-usage"]');
    expect(tagLinks.length).toBe(1);
    expect(tagLinks.text().trim()).toBe("ai-usage");
  });

  test("untagged post renders no tag links", () => {
    const rowsWithTagLinks = $("li").filter(
      (_, li) => $(li).find('a[href^="/tags/"]').length > 0,
    ).length;
    const totalRows = $("li").length;
    // Not every post is tagged yet, so some rows must have no tag links
    expect(rowsWithTagLinks).toBeGreaterThan(0);
    expect(rowsWithTagLinks).toBeLessThan(totalRows);
  });
});
